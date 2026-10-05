/*
 * Calendario de la naturaleza: lógica pura. Compara, para una región, cuántas
 * observaciones confirmadas de iNaturalist tuvo cada especie en un mes, en el
 * mes anterior y en todo el año. De ahí salen tres listas honestas:
 *
 *   en pico      el mes concentra al menos el doble de observaciones que un mes
 *                «normal» de esa especie (recuento del mes × 12 / recuento anual);
 *   aparecen     este mes se ve al menos 3 veces más que el anterior;
 *   se despiden  este mes se ve 3 veces menos o menos que el anterior.
 *
 * Con pocas observaciones nada de esto es fiable, así que hay un mínimo.
 * «Migradora» no se deduce de los recuentos: viene del catálogo (campo de
 * migración) y solo se muestra cuando existe.
 */

export const MIN_OBS = 8;
export const PEAK_RATIO = 2;
export const SHIFT_RATIO = 3;

export type Counts = Map<number, number>;
export type Entry = { id: number; count: number; prev: number; year: number; ratio: number };

export function peakRatio(month: number, year: number): number {
  return year > 0 ? (month * 12) / year : 0;
}

export function classifyMonth(month: Counts, prev: Counts, year: Counts): { peak: Entry[]; arriving: Entry[]; leaving: Entry[] } {
  const peak: Entry[] = [];
  const arriving: Entry[] = [];
  const leaving: Entry[] = [];
  const ids = new Set([...month.keys(), ...prev.keys()]);
  for (const id of ids) {
    const m = month.get(id) ?? 0;
    const p = prev.get(id) ?? 0;
    const y = year.get(id) ?? 0;
    const entry: Entry = { id, count: m, prev: p, year: y, ratio: peakRatio(m, y) };
    if (m >= MIN_OBS && y >= m && entry.ratio >= PEAK_RATIO) peak.push(entry);
    if (m >= MIN_OBS && m >= SHIFT_RATIO * Math.max(p, 1)) arriving.push(entry);
    if (p >= MIN_OBS && m * SHIFT_RATIO <= p) leaving.push(entry);
  }
  peak.sort((a, b) => b.ratio * Math.log1p(b.count) - a.ratio * Math.log1p(a.count));
  arriving.sort((a, b) => b.count - a.count);
  leaving.sort((a, b) => b.prev - a.prev);
  return { peak, arriving, leaving };
}

/** Mes anterior en 1–12 (enero → diciembre). */
export function prevMonth(month: number): number {
  return month === 1 ? 12 : month - 1;
}

/** Normaliza 12 valores a 0–1 respecto al máximo (0 si todo es cero). */
export function normalizeMonths(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? v / max : 0));
}

export function isMigratory(migration: string | null | undefined): boolean {
  return !!migration && /migrador/i.test(migration);
}
