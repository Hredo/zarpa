import type { DayPhase } from './dayPhase';

/*
 * Lógica pura del modo excursión (sin red ni base de datos, para probarla).
 *
 * «Probabilidad» aquí es RELATIVA, no un porcentaje de aparición: compara las
 * especies de tu lista entre sí. Parte de cuántas observaciones confirmadas de
 * iNaturalist hubo cerca de ti en este mes del año (el dato más honesto de lo
 * que se deja ver en esa época) y la ajusta con el horario de actividad del
 * catálogo cuando se conoce (diurno, nocturno, crepuscular). Cuando el
 * catálogo no trae horario no se ajusta y la ficha lo dice.
 */

export type Activity = string | null | undefined;

type Slot = 'day' | 'twilight' | 'night';

export function slotOf(phase: DayPhase): Slot {
  if (phase === 'amanecer' || phase === 'atardecer') return 'twilight';
  if (phase === 'noche') return 'night';
  return 'day';
}

/**
 * Cuánto encaja el horario de actividad del animal con la franja elegida, de 0
 * a 1. `null` si el catálogo no sabe cuándo está activo.
 */
export function activityFactor(activity: Activity, phase: DayPhase): number | null {
  if (!activity) return null;
  const a = activity.toLowerCase();
  const hasNight = /nocturn/.test(a) || /de noche/.test(a);
  const hasDay = /diurn/.test(a) || /de d.a/.test(a);
  const hasTwilight = /crepuscul/.test(a);
  if (!hasNight && !hasDay && !hasTwilight) return null;
  const w: Record<Slot, number> = { day: 0.15, twilight: 0.4, night: 0.15 };
  if (hasDay) {
    w.day = 1;
    w.twilight = Math.max(w.twilight, 0.7);
  }
  if (hasNight) {
    w.night = 1;
    w.twilight = Math.max(w.twilight, 0.7);
  }
  if (hasDay && hasNight) w.twilight = 1;
  if (hasTwilight) w.twilight = 1;
  return w[slotOf(phase)];
}

/** Escala logarítmica: unas pocas especies muy vistas no aplastan al resto. */
export function monthScore(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  return Math.min(1, Math.log1p(count) / Math.log1p(maxCount));
}

export type Probability = { p: number; scheduleKnown: boolean };

export function excursionProbability(input: { monthCount: number; maxMonthCount: number; activity: Activity; phase: DayPhase }): Probability {
  const base = monthScore(input.monthCount, input.maxMonthCount);
  const f = activityFactor(input.activity, input.phase);
  return { p: base * (f ?? 1), scheduleKnown: f !== null };
}

export type Level = { code: 'alta' | 'media' | 'baja' | 'remota'; label: string };

export function probabilityLevel(p: number): Level {
  if (p >= 0.6) return { code: 'alta', label: 'Muy probable' };
  if (p >= 0.35) return { code: 'media', label: 'Probable' };
  if (p >= 0.15) return { code: 'baja', label: 'Posible' };
  return { code: 'remota', label: 'Poco probable' };
}

export type Scored<T> = T & { p: number; scheduleKnown: boolean };

/** Agrupa por grupo animal; dentro, de más a menos probable; los grupos, por su mejor especie. */
export function groupByGroup<T extends { grp: string; p: number }>(items: T[]): { grp: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const list = map.get(it.grp);
    if (list) list.push(it);
    else map.set(it.grp, [it]);
  }
  return [...map.entries()]
    .map(([grp, list]) => ({ grp, items: [...list].sort((a, b) => b.p - a.p) }))
    .sort((a, b) => b.items[0].p - a.items[0].p);
}

export type TargetState = { species_id: number; seen: boolean };

/** Resumen de una salida: cuántos objetivos se vieron y cuántos fueron especies nuevas para el álbum. */
export function summarize(targets: TargetState[], newSpecies: number, startedAt: string, endedAt: string) {
  const seen = targets.filter((t) => t.seen).length;
  const minutes = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
  return { seen, total: targets.length, ratio: targets.length ? seen / targets.length : 0, newSpecies, minutes };
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
