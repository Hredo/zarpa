import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  deleteUser,
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  signInWithCredential,
  signOut as fbSignOut,
  updateProfile,
  type AuthCredential,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { Platform } from 'react-native';

import { wipeAccountData } from '@/social/flows';
import { clearAccountState } from '@/sync/db';
import { storagePath } from '@/sync/schema';

import { fb, firebaseEnabled, storageEnabled } from './firebase';

/*
 * Acciones de cuenta. Sin estado: el estado reactivo vive en `store/auth.ts`.
 *
 *   Google  @react-native-google-signin → idToken → credencial de Firebase
 *   Apple   expo-apple-authentication (solo iOS) con nonce SHA-256 → OAuthProvider('apple.com')
 *
 * Iniciar sesión es opcional: nada de esto se llama al arrancar y la app
 * funciona entera sin cuenta.
 */

/** Error de cuenta con un mensaje listo para enseñar, en español. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** El usuario cerró la ventana: no es un error que haya que contar. */
export class AuthCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AuthCancelled';
  }
}

export const googleAvailable = firebaseEnabled && Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
export const appleSupported = Platform.OS === 'ios';

let googleConfigured = false;
function configureGoogle(): void {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
  });
  googleConfigured = true;
}

function messageFor(e: unknown): AuthError {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : 'unknown';
  switch (code) {
    case 'auth/network-request-failed':
    case 'unavailable':
      return new AuthError('Sin conexión. Comprueba tu red e inténtalo de nuevo.', code);
    case 'auth/account-exists-with-different-credential':
      return new AuthError('Ya existe una cuenta con ese correo usando otro método de acceso.', code);
    case 'auth/user-disabled':
      return new AuthError('Esta cuenta está desactivada.', code);
    case 'auth/too-many-requests':
      return new AuthError('Demasiados intentos. Espera un momento y vuelve a probar.', code);
    case 'auth/invalid-credential':
    case 'auth/operation-not-allowed':
      return new AuthError('Firebase no tiene activado este método de acceso. Revisa la consola.', code);
    case 'auth/requires-recent-login':
    case 'auth/user-token-expired':
      return new AuthError('Por seguridad, vuelve a iniciar sesión y repite el borrado.', code);
    case 'auth/user-mismatch':
      return new AuthError('Elige la misma cuenta con la que entraste.', code);
    default:
      return new AuthError('No se pudo completar la operación. Inténtalo de nuevo.', code);
  }
}

/** Credencial de Google (ventana de cuentas; en silencio si `silent` y ya hubo sesión). */
async function googleCredential(silent = false): Promise<AuthCredential> {
  configureGoogle();
  if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  let idToken: string | null = null;
  if (silent) {
    const quiet = await GoogleSignin.signInSilently().catch(() => null);
    if (quiet?.type === 'success') idToken = quiet.data.idToken;
  }
  if (!idToken) {
    const res = await GoogleSignin.signIn();
    if (res.type !== 'success') throw new AuthCancelled();
    idToken = res.data.idToken;
  }
  if (!idToken) throw new AuthError('Google no devolvió credenciales. Inténtalo de nuevo.', 'no-id-token');
  return GoogleAuthProvider.credential(idToken);
}

function googleFailure(e: unknown): Error {
  if (e instanceof AuthCancelled || e instanceof AuthError) return e;
  // Código 12501 (Android) / SIGN_IN_CANCELLED: el usuario cerró la ventana.
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code === 'SIGN_IN_CANCELLED' || code === '-5' || code === '12501') return new AuthCancelled();
  return messageFor(e);
}

export async function signInWithGoogle(): Promise<void> {
  if (!googleAvailable) throw new AuthError('El acceso con Google aún no está configurado.', 'disabled');
  try {
    await signInWithCredential(fb().auth, await googleCredential());
  } catch (e) {
    throw googleFailure(e);
  }
}

/** Credencial de Apple con nonce (Apple recibe el hash; Firebase comprueba el original). */
async function appleCredential(): Promise<{ credential: AuthCredential; name: string }> {
  if (!(await AppleAuthentication.isAvailableAsync())) throw new AuthError('Este dispositivo no admite el acceso con Apple.', 'unsupported');
  const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const apple = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashed,
  });
  if (!apple.identityToken) throw new AuthError('Apple no devolvió credenciales. Inténtalo de nuevo.', 'no-id-token');
  const name = apple.fullName ? AppleAuthentication.formatFullName(apple.fullName) : '';
  return { credential: new OAuthProvider('apple.com').credential({ idToken: apple.identityToken, rawNonce }), name };
}

function appleFailure(e: unknown): Error {
  if (e instanceof AuthError) return e;
  if (typeof e === 'object' && e && 'code' in e && (e as { code: unknown }).code === 'ERR_REQUEST_CANCELED') return new AuthCancelled();
  return messageFor(e);
}

export async function signInWithApple(): Promise<void> {
  if (!firebaseEnabled || !appleSupported) throw new AuthError('El acceso con Apple no está disponible.', 'disabled');
  try {
    const { credential, name } = await appleCredential();
    const { user } = await signInWithCredential(fb().auth, credential);
    // Apple solo envía el nombre la primera vez: se guarda ahora o se pierde.
    if (name && !user.displayName) await updateProfile(user, { displayName: name }).catch(() => {});
  } catch (e) {
    throw appleFailure(e);
  }
}

export async function signOutUser(): Promise<void> {
  if (!firebaseEnabled) return;
  await fbSignOut(fb().auth);
  if (googleAvailable) {
    configureGoogle();
    await GoogleSignin.signOut().catch(() => {});
  }
}

/** Firebase pide haber entrado hace poco para borrar la cuenta: se confirma antes de tocar nada. */
const RECENT_LOGIN_MS = 4 * 60 * 1000;

async function ensureRecentLogin(user: User): Promise<void> {
  const last = Date.parse(user.metadata.lastSignInTime ?? '');
  if (Number.isFinite(last) && Date.now() - last < RECENT_LOGIN_MS) return;
  const provider = user.providerData[0]?.providerId;
  try {
    if (provider === 'google.com') await reauthenticateWithCredential(user, await googleCredential(true));
    else if (provider === 'apple.com') await reauthenticateWithCredential(user, (await appleCredential()).credential);
  } catch (e) {
    throw provider === 'apple.com' ? appleFailure(e) : googleFailure(e);
  }
}

/**
 * Borra la cuenta entera desde la app (en el plan gratuito no hay servidor):
 * confirma la identidad si hace falta, borra de Firestore todo lo suyo y su
 * rastro en las listas de sus amigos, sus ficheros de Storage (si lo hay) y,
 * por último, la cuenta de Auth. Si algo falla a medias se puede repetir. El
 * cuaderno del móvil NO se toca.
 */
export async function deleteAccount(uid: string): Promise<void> {
  const user = fb().auth.currentUser;
  if (!user || user.uid !== uid) throw new AuthError('La sesión ha caducado. Vuelve a iniciar sesión.', 'no-user');
  await ensureRecentLogin(user);
  try {
    const files = await wipeAccountData(fb().db, uid);
    if (storageEnabled) {
      const paths = files.flatMap((f) => [
        f.photo ? storagePath.photo(uid, f.id) : null,
        f.sticker ? storagePath.sticker(uid, f.id, f.sticker) : null,
        f.voice ? storagePath.voice(uid, f.id, f.voice) : null,
      ]);
      await Promise.allSettled(paths.filter((p): p is string => !!p).map((p) => deleteObject(ref(fb().storage, p))));
    }
    await deleteUser(user);
  } catch (e) {
    throw messageFor(e);
  }
  await clearAccountState(uid).catch(() => {});
  if (googleAvailable) {
    configureGoogle();
    await GoogleSignin.revokeAccess().catch(() => {});
    await GoogleSignin.signOut().catch(() => {});
  }
  // La cuenta ya no existe: el cierre local puede fallar sin consecuencias.
  await fbSignOut(fb().auth).catch(() => {});
}

/** Alias del perfil (1–40 caracteres, sin espacios sobrantes). */
export function cleanAlias(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 40);
}

export async function saveAlias(uid: string, alias: string): Promise<void> {
  const clean = cleanAlias(alias);
  if (!clean) throw new AuthError('Escribe un nombre.', 'empty-alias');
  try {
    await updateDoc(doc(fb().db, 'users', uid), { alias: clean, updatedAt: serverTimestamp() });
  } catch (e) {
    throw messageFor(e);
  }
}

/** Activa o desactiva compartir el álbum con los amigos (al desactivarlo, la app lo retira de la nube). */
export async function saveShareAlbum(uid: string, on: boolean): Promise<void> {
  try {
    await updateDoc(doc(fb().db, 'users', uid), { shareAlbum: on, updatedAt: serverTimestamp() });
  } catch (e) {
    throw messageFor(e);
  }
}
