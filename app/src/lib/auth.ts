import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleAuthProvider, OAuthProvider, signInWithCredential, signOut as fbSignOut, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Platform } from 'react-native';

import { clearAccountState } from '@/sync/db';

import { fb, firebaseEnabled } from './firebase';

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
    case 'functions/unauthenticated':
      return new AuthError('La sesión ha caducado. Vuelve a iniciar sesión.', code);
    default:
      return new AuthError('No se pudo completar la operación. Inténtalo de nuevo.', code);
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!googleAvailable) throw new AuthError('El acceso con Google aún no está configurado.', 'disabled');
  try {
    configureGoogle();
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (res.type !== 'success') throw new AuthCancelled();
    const idToken = res.data.idToken;
    if (!idToken) throw new AuthError('Google no devolvió credenciales. Inténtalo de nuevo.', 'no-id-token');
    await signInWithCredential(fb().auth, GoogleAuthProvider.credential(idToken));
  } catch (e) {
    if (e instanceof AuthCancelled || e instanceof AuthError) throw e;
    // Código 12501 (Android) / SIGN_IN_CANCELLED: el usuario cerró la ventana.
    const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
    if (code === 'SIGN_IN_CANCELLED' || code === '-5' || code === '12501') throw new AuthCancelled();
    throw messageFor(e);
  }
}

export async function signInWithApple(): Promise<void> {
  if (!firebaseEnabled || !appleSupported) throw new AuthError('El acceso con Apple no está disponible.', 'disabled');
  try {
    if (!(await AppleAuthentication.isAvailableAsync())) throw new AuthError('Este dispositivo no admite el acceso con Apple.', 'unsupported');
    // Apple recibe el hash del nonce; Firebase comprueba el original.
    const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const apple = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!apple.identityToken) throw new AuthError('Apple no devolvió credenciales. Inténtalo de nuevo.', 'no-id-token');
    const credential = new OAuthProvider('apple.com').credential({ idToken: apple.identityToken, rawNonce });
    const { user } = await signInWithCredential(fb().auth, credential);
    // Apple solo envía el nombre la primera vez: se guarda ahora o se pierde.
    const name = apple.fullName ? AppleAuthentication.formatFullName(apple.fullName) : '';
    if (name && !user.displayName) await updateProfile(user, { displayName: name }).catch(() => {});
  } catch (e) {
    if (e instanceof AuthError) throw e;
    if (typeof e === 'object' && e && 'code' in e && (e as { code: unknown }).code === 'ERR_REQUEST_CANCELED') throw new AuthCancelled();
    throw messageFor(e);
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

/**
 * Borra la cuenta entera: la función `deleteAccount` (europe-west1) elimina
 * Firestore, Storage y Auth. Después se limpia el estado de sincronización y
 * se cierra la sesión local. El cuaderno del móvil NO se toca.
 */
export async function deleteAccount(uid: string): Promise<void> {
  try {
    await httpsCallable(fb().functions, 'deleteAccount')();
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
