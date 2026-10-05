import {
  collection,
  collectionGroup,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';

/*
 * Lo social y el ciclo de vida de la cuenta, hechos desde la app.
 *
 * Zarpa funciona en el plan gratuito de Firebase (sin Cloud Functions): cada
 * escritura que toca a dos personas la hace el móvil de una de ellas y
 * `firestore.rules` comprueba que la otra dio su consentimiento (una amistad
 * solo entra en tu lista si tú la pediste). Este módulo solo depende de
 * `firebase/firestore`: lo usa la app y lo prueban las reglas contra el
 * emulador (`firebase/test/flows.test.ts`).
 *
 * Modelo:
 *   users/{uid}                            perfil (alias, foto, contadores, friendCode)
 *   friendCodes/{código} → {uid}           índice de códigos (se lee de uno en uno)
 *   publicProfiles/{uid}                   alias, foto, contadores y si comparte álbum
 *   users/{uid}/friendRequests/{fromUid}   solicitudes recibidas
 *   users/{uid}/friends/{fid}              amistad (una ficha en cada sentido)
 *   users/{uid}/album/{especie}            álbum compartido
 */

/** Sin 0/O ni 1/I/L: se dicta y se copia sin errores. Igual que en firestore.rules. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const MAX_FRIENDS = 200;
export const MAX_PENDING = 50;
/** Escrituras por lote (Firestore admite 500). */
const BATCH = 400;

export class SocialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialError';
  }
}

export type Me = { uid: string; alias: string; photoURL: string | null };

export function makeFriendCode(rand: (max: number) => number): string {
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

/** «ABCD EFGH»: el código se lee y se dicta mejor en dos bloques. */
export function fmtCode(code: string | null | undefined): string {
  if (!code) return '';
  return code.length === CODE_LENGTH ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}

/** Alias del perfil (1–40 caracteres, sin espacios sobrantes). */
export function cleanAlias(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** Foto que aceptan las reglas: https y no más de 1000 caracteres. */
export function cleanPhoto(url: string | null | undefined): string | null {
  return typeof url === 'string' && url.startsWith('https://') && url.length <= 1000 ? url : null;
}

/** Perfil de partida (las reglas exigen exactamente esta forma al crearlo). */
export async function createProfile(db: Firestore, user: { uid: string; displayName: string | null; photoURL: string | null }): Promise<void> {
  await setDoc(doc(db, 'users', user.uid), {
    alias: cleanAlias(user.displayName) || 'Explorador',
    photoURL: cleanPhoto(user.photoURL),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    counters: { sightings: 0, species: 0 },
    shareAlbum: false,
  });
}

/**
 * Código de amigo de la cuenta; si no tiene, se le asigna uno libre. El índice
 * y el perfil se escriben juntos: si el código ya era de otro, las reglas
 * rechazan el lote y se prueba con otro.
 */
export async function ensureFriendCode(db: Firestore, uid: string, rand: (max: number) => number): Promise<string> {
  const userRef = doc(db, 'users', uid);
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = (await getDoc(userRef)).get('friendCode');
    if (typeof current === 'string' && current) return current;
    const code = makeFriendCode(rand);
    if ((await getDoc(doc(db, 'friendCodes', code))).exists()) continue;
    const batch = writeBatch(db);
    batch.set(doc(db, 'friendCodes', code), { uid, createdAt: serverTimestamp() });
    batch.update(userRef, { friendCode: code, updatedAt: serverTimestamp() });
    try {
      await batch.commit();
      return code;
    } catch (e) {
      if (errorCode(e) !== 'permission-denied') throw e;
      // Otro móvil le puso código a la vez, o alguien cogió este mismo: se reintenta.
    }
  }
  throw new SocialError('No se pudo crear tu código de amigo. Inténtalo de nuevo.');
}

const friendRef = (db: Firestore, owner: string, friend: string) => doc(db, 'users', owner, 'friends', friend);
const requestRef = (db: Firestore, to: string, from: string) => doc(db, 'users', to, 'friendRequests', from);

async function friendCount(db: Firestore, uid: string): Promise<number> {
  return (await getCountFromServer(collection(db, 'users', uid, 'friends'))).data().count;
}

/** Hace amigos a `me` y a quien le pidió amistad (`from`), con los datos de su solicitud. */
async function befriend(db: Firestore, me: Me, from: string, theirs: { alias?: unknown; photoURL?: unknown }): Promise<void> {
  const batch = writeBatch(db);
  const since = serverTimestamp();
  batch.set(friendRef(db, me.uid, from), {
    since,
    alias: cleanAlias(typeof theirs.alias === 'string' ? theirs.alias : '') || 'Explorador',
    photoURL: cleanPhoto(typeof theirs.photoURL === 'string' ? theirs.photoURL : null),
  });
  batch.set(friendRef(db, from, me.uid), { since, alias: cleanAlias(me.alias) || 'Explorador', photoURL: cleanPhoto(me.photoURL) });
  batch.delete(requestRef(db, me.uid, from));
  // Si yo también se la había pedido, mi solicitud sobra.
  batch.delete(requestRef(db, from, me.uid));
  await batch.commit();
}

/** Pide amistad con un código. Si la otra persona ya me la había pedido, quedamos como amigos. */
export async function sendFriendRequest(db: Firestore, me: Me, rawCode: string): Promise<'sent' | 'friends'> {
  const code = normalizeCode(rawCode);
  if (!code) throw new SocialError('Ese código no es válido: son 8 letras y números.');
  const target = (await getDoc(doc(db, 'friendCodes', code))).get('uid');
  if (typeof target !== 'string' || !target) throw new SocialError('No hay nadie con ese código.');
  if (target === me.uid) throw new SocialError('Ese es tu propio código.');
  if ((await getDoc(friendRef(db, me.uid, target))).exists()) return 'friends';

  if ((await friendCount(db, me.uid)) >= MAX_FRIENDS) throw new SocialError(`Puedes tener hasta ${MAX_FRIENDS} amigos.`);
  // Ya me lo había pedido: se acepta directamente.
  const theirs = await getDoc(requestRef(db, me.uid, target));
  if (theirs.exists()) {
    await befriend(db, me, target, theirs.data());
    return 'friends';
  }
  try {
    await setDoc(requestRef(db, target, me.uid), {
      from: me.uid,
      alias: cleanAlias(me.alias) || 'Explorador',
      photoURL: cleanPhoto(me.photoURL),
      at: serverTimestamp(),
    });
  } catch (e) {
    // Las reglas exigen que la cuenta exista: un código de una cuenta borrada.
    if (errorCode(e) === 'permission-denied') throw new SocialError('No hay nadie con ese código.');
    throw e;
  }
  return 'sent';
}

/** Acepta o rechaza una solicitud recibida. */
export async function respondFriendRequest(db: Firestore, me: Me, from: string, accept: boolean): Promise<'friends' | 'declined'> {
  const req = await getDoc(requestRef(db, me.uid, from));
  if (!req.exists()) throw new SocialError('Esa solicitud ya no existe.');
  if (!accept) {
    const batch = writeBatch(db);
    batch.delete(req.ref);
    await batch.commit();
    return 'declined';
  }
  if ((await friendCount(db, me.uid)) >= MAX_FRIENDS) throw new SocialError(`Puedes tener hasta ${MAX_FRIENDS} amigos.`);
  await befriend(db, me, from, req.data());
  return 'friends';
}

/** Deja de ser amigo de alguien (en los dos sentidos). */
export async function removeFriend(db: Firestore, uid: string, other: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(friendRef(db, uid, other));
  batch.delete(friendRef(db, other, uid));
  await batch.commit();
}

export type PublicProfile = { alias: string; photoURL: string | null; shareAlbum: boolean; sightings: number; species: number };

/** Copia lo público del perfil (lo que ven tus amigos y quien recibe tu solicitud). */
export async function publishPublicProfile(db: Firestore, uid: string, p: PublicProfile): Promise<void> {
  await setDoc(doc(db, 'publicProfiles', uid), {
    alias: cleanAlias(p.alias) || 'Explorador',
    photoURL: cleanPhoto(p.photoURL),
    shareAlbum: p.shareAlbum,
    sightings: Math.max(0, Math.floor(p.sightings)),
    species: Math.max(0, Math.floor(p.species)),
    updatedAt: serverTimestamp(),
  });
}

/** Alias o foto nuevos: se refrescan en la lista de amigos de los demás. */
export async function refreshFriendEdges(db: Firestore, uid: string, friendUids: string[], alias: string, photoURL: string | null): Promise<void> {
  const data = { alias: cleanAlias(alias) || 'Explorador', photoURL: cleanPhoto(photoURL) };
  // Una a una: si alguien ya te quitó de amigos, su ficha no existe y no debe
  // tumbar las demás.
  await Promise.allSettled(friendUids.map((f) => updateDoc(friendRef(db, f, uid), data)));
}

/** Retira de la nube el álbum compartido (al dejar de compartirlo). */
export async function withdrawAlbum(db: Firestore, uid: string): Promise<number> {
  const snap = await getDocs(collection(db, 'users', uid, 'album'));
  await commitInChunks(db, snap.docs, (batch, d) => batch.delete(d.ref));
  return snap.size;
}

export type CloudFiles = { id: string; photo: boolean; sticker: string | null; voice: string | null }[];

/**
 * Borra de Firestore todo lo de la cuenta y su rastro en las de otros:
 * amistades (las dos fichas), solicitudes enviadas y recibidas, álbum,
 * avistamientos, ajustes, código de amigo, perfil público y perfil. Devuelve
 * qué ficheros tenía cada avistamiento, para borrarlos de Storage si lo hay.
 * Se puede repetir: lo que ya no existe se salta.
 */
export async function wipeAccountData(db: Firestore, uid: string): Promise<CloudFiles> {
  const friends = await getDocs(collection(db, 'users', uid, 'friends'));
  await commitInChunks(db, friends.docs, (batch, f) => {
    batch.delete(friendRef(db, f.id, uid));
    batch.delete(f.ref);
  });
  const sent = await getDocs(query(collectionGroup(db, 'friendRequests'), where('from', '==', uid)));
  const received = await getDocs(collection(db, 'users', uid, 'friendRequests'));
  const album = await getDocs(collection(db, 'users', uid, 'album'));
  const sightings = await getDocs(collection(db, 'users', uid, 'sightings'));
  const refs: DocumentReference[] = [...sent.docs, ...received.docs, ...album.docs, ...sightings.docs].map((d) => d.ref);
  refs.push(doc(db, 'users', uid, 'private', 'settings'));
  await commitInChunks(db, refs, (batch, r) => batch.delete(r));

  const profile = await getDoc(doc(db, 'users', uid));
  const code = profile.get('friendCode');
  const last = writeBatch(db);
  if (typeof code === 'string' && code) {
    const owned = await getDoc(doc(db, 'friendCodes', code));
    if (owned.get('uid') === uid) last.delete(owned.ref);
  }
  last.delete(doc(db, 'publicProfiles', uid));
  last.delete(profile.ref);
  await last.commit();

  return sightings.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      photo: v.has_photo === true,
      sticker: v.has_sticker === true && (v.sticker_ext === 'png' || v.sticker_ext === 'jpg') ? v.sticker_ext : null,
      voice: v.has_voice === true && typeof v.voice_ext === 'string' ? v.voice_ext : null,
    };
  });
}

async function commitInChunks<T>(db: Firestore, items: T[], add: (batch: ReturnType<typeof writeBatch>, item: T) => void): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH / 2) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + BATCH / 2)) add(batch, item);
    await batch.commit();
  }
}

/** Código de error de Firestore sin el prefijo («permission-denied», «unavailable»…). */
export function errorCode(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  return code.replace(/^firestore\//, '');
}
