import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
// getReactNativePersistence solo existe en la entrada de React Native del SDK.
// @ts-expect-error: los tipos públicos de firebase/auth no la declaran.
import { connectAuthEmulator, getReactNativePersistence, initializeAuth, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';

/*
 * Punto único de Firebase. Todo el código de la app importa de aquí: nadie
 * llama a initializeApp por su cuenta.
 *
 * La configuración llega por variables EXPO_PUBLIC_* (ver .env.example). Si
 * falta, `firebaseEnabled` es false y la app sigue funcionando en local: el
 * cuaderno vive en SQLite y la nube es un extra.
 */

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId && config.appId);
const useEmulators = process.env.EXPO_PUBLIC_FIREBASE_EMULATORS === '1';
/** En el emulador de Android el host del PC es 10.0.2.2. */
const EMU_HOST = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

let cached: { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage; functions: Functions } | null = null;

/** Servicios de Firebase. Lanza si la configuración no está: comprueba `firebaseEnabled` antes. */
export function fb() {
  if (cached) return cached;
  if (!firebaseEnabled) throw new Error('Firebase no está configurado (falta .env)');
  const first = getApps().length === 0;
  const app = first ? initializeApp(config) : getApp();
  const auth = first ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }) : getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const functions = getFunctions(app, 'europe-west1');
  if (first && useEmulators) {
    connectAuthEmulator(auth, `http://${EMU_HOST}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, EMU_HOST, 8080);
    connectStorageEmulator(storage, EMU_HOST, 9199);
    connectFunctionsEmulator(functions, EMU_HOST, 5001);
  }
  cached = { app, auth, db, storage, functions };
  return cached;
}
