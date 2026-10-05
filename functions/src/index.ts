import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as v1 from 'firebase-functions/v1';

import { cleanupSocial, ensureFriendCode } from './social';

export { getFriendCode, onAlbumWrite, onProfileWrite, removeFriend, respondFriendRequest, sendFriendRequest } from './social';

/*
 * Funciones de Zarpa. Región única: europe-west1 (cerca de los datos, eur3).
 *
 *   onUserCreate   crea el perfil al registrarse (v1: Firebase Auth aún no
 *                  tiene disparador de alta en v2 sin Identity Platform).
 *   deleteAccount  borra Firestore, Storage y Auth del usuario que llama.
 *                  Las tiendas lo exigen (Apple 5.1.1(v), Google Play).
 *   onSightingWrite mantiene el contador de avistamientos del perfil. El
 *                  cliente no puede escribir contadores: así no se falsean.
 *   social.ts      amigos por código y álbum compartido (ver allí).
 */

const REGION = 'europe-west1';

if (getApps().length === 0) initializeApp();

/** Alias inicial a partir del nombre de la cuenta; nunca el correo. */
export function initialAlias(displayName: string | undefined | null): string {
  const clean = (displayName ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return clean || 'Explorador';
}

export const onUserCreate = v1.region(REGION).auth.user().onCreate(async (user) => {
  const ref = getFirestore().doc(`users/${user.uid}`);
  await ref.set(
    {
      alias: initialAlias(user.displayName),
      photoURL: user.photoURL ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      counters: { sightings: 0, species: 0 },
      shareAlbum: false,
    },
    { merge: true },
  );
  await ref.collection('private').doc('settings').set({ createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await ensureFriendCode(getFirestore(), user.uid);
  logger.info('Perfil creado', { uid: user.uid });
});

export const onSightingWrite = onDocumentWritten({ document: 'users/{uid}/sightings/{id}', region: REGION }, async (event) => {
  const before = event.data?.before.exists ?? false;
  const after = event.data?.after.exists ?? false;
  if (before === after) return;
  const ref = getFirestore().doc(`users/${event.params.uid}`);
  // update falla si el perfil ya no existe (cuenta borrada): es lo que queremos.
  await ref.update({ 'counters.sightings': FieldValue.increment(after ? 1 : -1) }).catch((e: unknown) => {
    logger.warn('No se pudo actualizar el contador', { uid: event.params.uid, e: String(e) });
  });
});

export const deleteAccount = onCall({ region: REGION, enforceAppCheck: false, timeoutSeconds: 300 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Hay que iniciar sesión para borrar la cuenta.');
  try {
    const db = getFirestore();
    await cleanupSocial(db, uid);
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await getStorage().bucket().deleteFiles({ prefix: `users/${uid}/`, force: true });
    await getAuth().deleteUser(uid);
  } catch (e) {
    logger.error('Fallo al borrar la cuenta', { uid, e: String(e) });
    throw new HttpsError('internal', 'No se pudo borrar la cuenta entera. Inténtalo de nuevo.');
  }
  logger.info('Cuenta borrada', { uid });
  return { ok: true };
});
