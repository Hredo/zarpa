import { create } from 'zustand';

/*
 * Estado visible de la sincronización (lo pinta el perfil).
 *   off      sin cuenta o Firebase sin configurar: no hay nada que sincronizar
 *   idle     al día (o pendiente de que haya cambios)
 *   syncing  trabajando
 *   offline  sin red; se reintenta sola al volver
 *   error    algo falló; se reintenta con espera creciente
 *   blocked  el cuaderno de este móvil es de otra cuenta: espera la decisión del usuario
 */
export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'error' | 'blocked';

/** Un móvil con el cuaderno de una cuenta e iniciando sesión otra cuenta. */
export type AccountConflict = {
  /** Cuenta que acaba de entrar. */
  uid: string;
  /** Cuenta dueña del cuaderno que hay en el móvil. */
  owner: string;
  /** Avistamientos en el móvil. */
  count: number;
  /** De ellos, los que aún no están en la nube de la cuenta dueña. */
  unsynced: number;
};

type State = {
  phase: SyncPhase;
  /** Avistamientos locales que aún no están en la nube. */
  pending: number;
  lastSyncAt: string | null;
  error: string | null;
  conflict: AccountConflict | null;
};

export const useSync = create<State>(() => ({ phase: 'off', pending: 0, lastSyncAt: null, error: null, conflict: null }));
