import { useAuth } from '@/store/auth';

import { getNotebookOwner } from './db';
import { countUnsynced, syncIdle, syncNow } from './engine';
import { wipeLocalNotebook } from './notebook';

/*
 * Cerrar sesión, con el cuaderno del móvil a elegir:
 *   keep  se queda en el móvil (sigue siendo de esta cuenta: si entra otra,
 *         se le preguntará qué hacer con él).
 *   wipe  se borra del móvil; lo que está en la nube no se toca. Para un móvil
 *         compartido o que se va a vender.
 */
export type SignOutMode = 'keep' | 'wipe';

export type SignOutResult =
  | { ok: true }
  /** Hay avistamientos que aún no están en la nube: borrar el móvil los perdería. */
  | { ok: false; unsynced: number };

export async function signOutWith(mode: SignOutMode, opts: { force?: boolean } = {}): Promise<SignOutResult> {
  const uid = useAuth.getState().user?.uid ?? null;
  if (mode === 'keep' || !uid) {
    await useAuth.getState().signOut();
    return { ok: true };
  }
  // Una última pasada para no dejar nada atrás.
  await syncNow({ retryExhausted: true }).catch(() => {});
  await syncIdle();
  const { unsynced } = await countUnsynced(uid);
  if (unsynced > 0 && !opts.force) return { ok: false, unsynced };
  // Primero se cierra la sesión (ninguna pasada puede ya tocar la nube) y
  // después se vacía el móvil.
  const owner = (await getNotebookOwner()) ?? uid;
  await useAuth.getState().signOut();
  await wipeLocalNotebook(owner);
  return { ok: true };
}
