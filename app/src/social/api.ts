import { httpsCallable } from 'firebase/functions';

import { fb } from '@/lib/firebase';

/*
 * Llamadas a las funciones sociales (functions/src/social.ts). Todo lo que
 * toca a dos personas pasa por el servidor; aquí solo se traducen los errores.
 */

export class SocialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialError';
  }
}

function friendly(e: unknown): SocialError {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : '';
  // Los mensajes de las funciones ya vienen en español y pensados para enseñarse.
  if (['functions/not-found', 'functions/invalid-argument', 'functions/resource-exhausted'].includes(code) && msg) return new SocialError(msg);
  if (code === 'functions/unauthenticated') return new SocialError('La sesión ha caducado. Vuelve a iniciar sesión.');
  if (code === 'functions/unavailable' || /network/i.test(msg)) return new SocialError('Sin conexión. Inténtalo cuando vuelva la red.');
  return new SocialError('No se pudo completar. Inténtalo de nuevo.');
}

async function call<T>(name: string, data?: unknown): Promise<T> {
  try {
    const res = await httpsCallable(fb().functions, name)(data);
    return res.data as T;
  } catch (e) {
    throw friendly(e);
  }
}

export const getFriendCode = () => call<{ code: string }>('getFriendCode');
export const sendFriendRequest = (code: string) => call<{ status: 'sent' | 'friends' }>('sendFriendRequest', { code });
export const respondFriendRequest = (from: string, accept: boolean) =>
  call<{ status: 'friends' | 'declined' }>('respondFriendRequest', { from, accept });
export const removeFriend = (uid: string) => call<{ ok: true }>('removeFriend', { uid });

/** «ABCD EFGH»: el código se lee y se dicta mejor en dos bloques. */
export function fmtCode(code: string | null | undefined): string {
  if (!code) return '';
  return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}
