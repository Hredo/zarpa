/*
 * Utilidades puras de los juegos (logros, misiones, quiz): fechas locales y un
 * generador pseudoaleatorio con semilla. Sin azar real: la misma fecha da
 * siempre las mismas misiones y las mismas preguntas, en cualquier móvil.
 */

/** Hash FNV-1a de 32 bits: de un texto a una semilla. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: generador con semilla. Devuelve reales en [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(items: readonly T[], next: () => number): T {
  return items[Math.floor(next() * items.length)];
}

/** Baraja (Fisher-Yates) sin tocar el original. */
export function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** «2026-10-05», en hora local. */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Número de día del calendario local (sin saltos por el cambio de hora). */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export function dayNumberOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export type IsoWeek = { year: number; week: number; id: string; start: Date; end: Date };

/** Semana ISO (lunes a domingo) que contiene la fecha, en hora local. */
export function isoWeek(date: Date = new Date()): IsoWeek {
  const day = (date.getDay() + 6) % 7; // lunes = 0
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - day);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  // El jueves de la semana decide a qué año ISO pertenece.
  const thursday = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate() + 3));
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
  return { year, week, id: `${year}-W${pad(week)}`, start, end };
}

/** Inicio del mes local y del siguiente. */
export function monthRange(date: Date = new Date()): { id: string; start: Date; end: Date } {
  return {
    id: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`,
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  };
}
