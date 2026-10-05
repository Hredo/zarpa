import { randomInt } from 'node:crypto';

import { FieldValue, getFirestore, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

/*
 * Lo social de Zarpa: amigos por código y álbum compartido con ellos.
 *
 * Principios (hay niños usando la app):
 *   - No hay buscador de personas. Solo se añade a alguien con su código de
 *     amigo, que esa persona comparte fuera de la app.
 *   - Toda escritura que toca a dos personas (solicitudes, amistades) la hace
 *     el servidor; el cliente solo lee lo suyo (ver firestore.rules).
 *   - El álbum compartido es opcional (`shareAlbum`) y solo lo ven los amigos:
 *     especies, recuentos, mes y pegatina. Nunca coordenadas ni fotos completas.
 *
 * Modelo:
 *   users/{uid}.friendCode                 código de 8 caracteres
 *   friendCodes/{code} → {uid}             índice inverso (solo servidor)
 *   publicProfiles/{uid}                   alias, avatar, contadores y si comparte álbum
 *   users/{uid}/friends/{fid}              amistad (una en cada sentido)
 *   users/{uid}/friendRequests/{fromUid}   solicitudes recibidas
 *   users/{uid}/album/{speciesId}          álbum compartido (lo escribe el dueño)
 */

const REGION = 'europe-west1';
/** Sin 0/O, 1/I/L: se dicta y se copia sin errores. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const MAX_FRIENDS = 200;
export const MAX_PENDING = 50;

export function makeFriendCode(rand: (max: number) => number = randomInt): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return out;
}

/** Normaliza lo que teclea la persona: mayúsculas, sin espacios ni guiones. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Datos públicos a partir del perfil privado (y del recuento del álbum). */
export function publicFrom(user: Record<string, unknown> | undefined): Record<string, unknown> {
  const counters = (user?.counters ?? {}) as Record<string, unknown>;
  return {
    alias: typeof user?.alias === 'string' && user.alias ? user.alias : 'Explorador',
    photoURL: typeof user?.photoURL === 'string' ? user.photoURL : null,
    shareAlbum: user?.shareAlbum === true,
    sightings: typeof counters.sightings === 'number' ? counters.sightings : 0,
    species: typeof counters.species === 'number' ? counters.species : 0,
  };
}

/** Asigna un código de amigo único a la cuenta si aún no tiene (idempotente). */
export async function ensureFriendCode(db: Firestore, uid: string): Promise<string> {
  const userRef = db.doc(`users/${uid}`);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeFriendCode();
    const result = await db.runTransaction(async (tx) => {
      const user = await tx.get(userRef);
      const existing = user.get('friendCode');
      if (typeof existing === 'string' && existing) return existing as string;
      const codeRef = db.doc(`friendCodes/${code}`);
      if ((await tx.get(codeRef)).exists) return null; // choque: otro código
      tx.set(codeRef, { uid, createdAt: FieldValue.serverTimestamp() });
      tx.set(userRef, { friendCode: code }, { merge: true });
      return code;
    });
    if (result) return result;
  }
  throw new HttpsError('resource-exhausted', 'No se pudo generar un código de amigo. Inténtalo de nuevo.');
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Hay que iniciar sesión.');
  return auth.uid;
}

async function areFriends(db: Firestore, a: string, b: string): Promise<boolean> {
  return (await db.doc(`users/${a}/friends/${b}`).get()).exists;
}

async function befriend(db: Firestore, a: string, b: string): Promise<void> {
  const [ua, ub] = await Promise.all([db.doc(`users/${a}`).get(), db.doc(`users/${b}`).get()]);
  const batch = db.batch();
  const since = FieldValue.serverTimestamp();
  batch.set(db.doc(`users/${a}/friends/${b}`), { since, ...pick(publicFrom(ub.data()), ['alias', 'photoURL']) });
  batch.set(db.doc(`users/${b}/friends/${a}`), { since, ...pick(publicFrom(ua.data()), ['alias', 'photoURL']) });
  batch.delete(db.doc(`users/${a}/friendRequests/${b}`));
  batch.delete(db.doc(`users/${b}/friendRequests/${a}`));
  await batch.commit();
}

function pick(o: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
}

/** Código propio (lo crea si la cuenta es anterior a lo social). */
export const getFriendCode = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const db = getFirestore();
  const code = await ensureFriendCode(db, uid);
  return { code };
});

/** Pide amistad con un código. Si la otra persona ya me la había pedido, quedamos como amigos. */
export const sendFriendRequest = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const code = normalizeCode((request.data as { code?: unknown } | undefined)?.code);
  if (!code) throw new HttpsError('invalid-argument', 'Ese código no es válido: son 8 letras y números.');
  const db = getFirestore();
  const target = (await db.doc(`friendCodes/${code}`).get()).get('uid') as string | undefined;
  if (!target) throw new HttpsError('not-found', 'No hay nadie con ese código.');
  if (target === uid) throw new HttpsError('invalid-argument', 'Ese es tu propio código.');
  if (await areFriends(db, uid, target)) return { status: 'friends' as const };

  const mine = await db.collection(`users/${uid}/friends`).count().get();
  if (mine.data().count >= MAX_FRIENDS) throw new HttpsError('resource-exhausted', `Puedes tener hasta ${MAX_FRIENDS} amigos.`);

  // Ya me lo había pedido: se acepta directamente.
  if ((await db.doc(`users/${uid}/friendRequests/${target}`).get()).exists) {
    await befriend(db, uid, target);
    return { status: 'friends' as const };
  }
  const pending = await db.collection(`users/${target}/friendRequests`).count().get();
  if (pending.data().count >= MAX_PENDING) throw new HttpsError('resource-exhausted', 'Esa persona tiene demasiadas solicitudes pendientes.');

  const me = publicFrom((await db.doc(`users/${uid}`).get()).data());
  await db.doc(`users/${target}/friendRequests/${uid}`).set({
    from: uid,
    alias: me.alias,
    photoURL: me.photoURL,
    at: FieldValue.serverTimestamp(),
  });
  return { status: 'sent' as const };
});

/** Acepta o rechaza una solicitud recibida. */
export const respondFriendRequest = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { from, accept } = (request.data ?? {}) as { from?: unknown; accept?: unknown };
  if (typeof from !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(from)) throw new HttpsError('invalid-argument', 'Solicitud no válida.');
  const db = getFirestore();
  const req = db.doc(`users/${uid}/friendRequests/${from}`);
  if (!(await req.get()).exists) throw new HttpsError('not-found', 'Esa solicitud ya no existe.');
  if (accept === true) {
    const mine = await db.collection(`users/${uid}/friends`).count().get();
    if (mine.data().count >= MAX_FRIENDS) throw new HttpsError('resource-exhausted', `Puedes tener hasta ${MAX_FRIENDS} amigos.`);
    await befriend(db, uid, from);
    return { status: 'friends' as const };
  }
  await req.delete();
  return { status: 'declined' as const };
});

/** Deja de ser amigo de alguien (en los dos sentidos). */
export const removeFriend = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const other = (request.data as { uid?: unknown } | undefined)?.uid;
  if (typeof other !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(other)) throw new HttpsError('invalid-argument', 'Amigo no válido.');
  const db = getFirestore();
  const batch = db.batch();
  batch.delete(db.doc(`users/${uid}/friends/${other}`));
  batch.delete(db.doc(`users/${other}/friends/${uid}`));
  await batch.commit();
  return { ok: true };
});

/** Copia lo público del perfil a `publicProfiles` y a las fichas de amistad. */
export const onProfileWrite = onDocumentWritten({ document: 'users/{uid}', region: REGION }, async (event) => {
  const uid = event.params.uid;
  const db = getFirestore();
  const after = event.data?.after;
  if (!after?.exists) {
    await db.doc(`publicProfiles/${uid}`).delete();
    return;
  }
  const next = publicFrom(after.data());
  const prev = event.data?.before.exists ? publicFrom(event.data.before.data()) : null;
  if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
  await db.doc(`publicProfiles/${uid}`).set({ ...next, updatedAt: FieldValue.serverTimestamp() });
  // Alias o avatar nuevos: se refrescan en la lista de amigos de los demás.
  if (!prev || prev.alias !== next.alias || prev.photoURL !== next.photoURL) {
    const friends = await db.collection(`users/${uid}/friends`).get();
    const writer = db.bulkWriter();
    for (const f of friends.docs) writer.set(db.doc(`users/${f.id}/friends/${uid}`), { alias: next.alias, photoURL: next.photoURL }, { merge: true });
    await writer.close();
  }
  // Quien deja de compartir su álbum lo retira de la nube.
  if (prev?.shareAlbum && !next.shareAlbum) await db.recursiveDelete(db.collection(`users/${uid}/album`));
});

/** Lleva el recuento de especies del álbum compartido. */
export const onAlbumWrite = onDocumentWritten({ document: 'users/{uid}/album/{speciesId}', region: REGION }, async (event) => {
  const before = event.data?.before.exists ?? false;
  const after = event.data?.after.exists ?? false;
  if (before === after) return;
  await getFirestore()
    .doc(`users/${event.params.uid}`)
    .update({ 'counters.species': FieldValue.increment(after ? 1 : -1) })
    .catch((e: unknown) => logger.warn('No se pudo actualizar el recuento de especies', { uid: event.params.uid, e: String(e) }));
});

/** Al borrar una cuenta: retira sus amistades del otro lado, sus solicitudes enviadas y su código. */
export async function cleanupSocial(db: Firestore, uid: string): Promise<void> {
  const refs: DocumentReference[] = [];
  const friends = await db.collection(`users/${uid}/friends`).get();
  for (const f of friends.docs) refs.push(db.doc(`users/${f.id}/friends/${uid}`));
  const sent = await db.collectionGroup('friendRequests').where('from', '==', uid).get();
  for (const r of sent.docs) refs.push(r.ref);
  const code = (await db.doc(`users/${uid}`).get()).get('friendCode');
  if (typeof code === 'string' && code) refs.push(db.doc(`friendCodes/${code}`));
  refs.push(db.doc(`publicProfiles/${uid}`));
  const writer = db.bulkWriter();
  for (const r of refs) writer.delete(r);
  await writer.close();
}
