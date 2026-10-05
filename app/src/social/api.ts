import * as Crypto from 'expo-crypto';

import { fb } from '@/lib/firebase';
import { useAuth } from '@/store/auth';

import * as flows from './flows';
import { errorCode, SocialError } from './flows';

/*
 * Acciones sociales de la app: la lógica está en `flows.ts` (la comparten las
 * pruebas de las reglas); aquí se añaden la cuenta abierta y los mensajes de
 * error para la persona.
 */

export { fmtCode, SocialError } from './flows';

function friendly(e: unknown): SocialError {
  if (e instanceof SocialError) return e;
  const code = errorCode(e);
  const msg = e instanceof Error ? e.message : '';
  if (code === 'unauthenticated') return new SocialError('La sesión ha caducado. Vuelve a iniciar sesión.');
  if (code === 'unavailable' || /network|offline/i.test(msg)) return new SocialError('Sin conexión. Inténtalo cuando vuelva la red.');
  return new SocialError('No se pudo completar. Inténtalo de nuevo.');
}

async function run<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    throw friendly(e);
  }
}

function me(): flows.Me {
  const { user, profile } = useAuth.getState();
  if (!user) throw new SocialError('Inicia sesión para usar los amigos.');
  return { uid: user.uid, alias: profile?.alias ?? user.displayName ?? 'Explorador', photoURL: profile?.photoURL ?? user.photoURL };
}

/** Azar del sistema (no Math.random): los códigos no deben poder adivinarse. */
export function secureRand(max: number): number {
  const bytes = Crypto.getRandomBytes(4);
  const n = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return n % max;
}

export const getFriendCode = () => run(async () => ({ code: await flows.ensureFriendCode(fb().db, me().uid, secureRand) }));
export const sendFriendRequest = (code: string) => run(async () => ({ status: await flows.sendFriendRequest(fb().db, me(), code) }));
export const respondFriendRequest = (from: string, accept: boolean) => run(async () => ({ status: await flows.respondFriendRequest(fb().db, me(), from, accept) }));
export const removeFriend = (uid: string) => run(async () => flows.removeFriend(fb().db, me().uid, uid));
