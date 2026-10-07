/*
 * Qué cierre de la app se enseña al volver a abrirla y con qué palabras.
 * Lógica pura (la lectura de ficheros y de Android está en crashLog.ts).
 */

export type Crash = {
  /** `js`: error fatal de JavaScript (o de un worklet); `native`: excepción de Android; `exit`: motivo que guarda Android. */
  kind: 'js' | 'native' | 'exit';
  message: string;
  stack?: string;
  /** Milisegundos desde 1970. */
  at: number;
};

/** Último cierre del proceso según Android (`ApplicationExitInfo`, Android 11+). */
export type ExitInfo = { reason: number; description: string; at: number; importance: number; trace: string };

// Códigos de ApplicationExitInfo.REASON_*.
const REASONS: Record<number, string> = {
  3: 'el sistema la cerró por falta de memoria',
  4: 'un error de la app',
  5: 'un fallo nativo (C++)',
  6: 'la app dejó de responder',
  7: 'una inicialización fallida',
  12: 'demasiados recursos en uso',
};

/** Importancia de un proceso en primer plano o visible (ActivityManager.RunningAppProcessInfo). */
const VISIBLE_IMPORTANCE = 200;

/** Si el motivo del sistema merece contarse: un cierre anómalo con la app a la vista. */
export function exitAsCrash(exit: ExitInfo | null): Crash | null {
  if (!exit || !(exit.reason in REASONS) || exit.importance > VISIBLE_IMPORTANCE) return null;
  const detail = exit.description ? ` (${exit.description})` : '';
  return { kind: 'exit', message: `Android dice que se cerró por ${REASONS[exit.reason]}${detail}.`, stack: exit.trace || undefined, at: exit.at };
}

/**
 * El cierre que hay que contar: el más detallado y nunca uno ya enseñado.
 * Un error de JS en producción también acaba como excepción de Android, así que
 * si los dos están se prefiere el de JS (dice qué falló en el código de la app).
 */
export function pickCrash(js: Crash | null, native: Crash | null, exit: Crash | null, seenAt: number): Crash | null {
  const fresh = [js, native, exit].filter((c): c is Crash => !!c && c.at > seenAt);
  if (fresh.length === 0) return null;
  const own = fresh.filter((c) => c.kind !== 'exit');
  if (own.length > 0) return own.find((c) => c.kind === 'js') ?? own[0];
  return fresh[0];
}

/** Texto para compartir con el equipo: qué pasó, cuándo y en qué versión. */
export function crashText(c: Crash, version: string): string {
  const when = new Date(c.at).toISOString();
  return [`Zarpa ${version} · ${when} · ${c.kind}`, c.message, c.stack ? `\n${c.stack}` : ''].join('\n').trim().slice(0, 9000);
}
