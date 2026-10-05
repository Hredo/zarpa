import { catalog } from '@/db';
import { getSpeciesByIds, type SpeciesRow } from '@/db/catalog';

import type { DayPhase } from './dayPhase';
import { excursionProbability, type Scored } from './excursionLogic';
import { cachedJson, type Fetched, type Nearby } from './remote';

/*
 * Qué se puede ver hoy aquí: especies con observaciones confirmadas de
 * iNaturalist a menos de `radiusKm` del punto en el mes del año elegido
 * (`species_counts` con `month=`; caché de una semana por celda de ~10 km) más
 * el horario de actividad del catálogo. Sin red se usa lo guardado; si no hay
 * nada, no se inventa una lista.
 */

export type Candidate = Scored<SpeciesRow & { count: number; activity: string | null }>;

export async function speciesInMonth(lat: number, lng: number, month: number, radiusKm = 10): Promise<Fetched<Nearby[]> | null> {
  const url =
    `https://api.inaturalist.org/v1/observations/species_counts?taxon_id=1&quality_grade=research&captive=false` +
    `&lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}&radius=${radiusKm}&month=${month}&per_page=200`;
  const res = await cachedJson<{ results: { count: number; taxon: { id: number; rank: string } }[] }>(
    `nearbym:${lat.toFixed(1)},${lng.toFixed(1)}:${radiusKm}:${month}`,
    url,
    7,
  );
  if (!res) return null;
  return {
    ...res,
    data: res.data.results.filter((r) => r.taxon.rank === 'species').map((r) => ({ id: r.taxon.id, count: r.count })),
  };
}

export async function activityOf(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await catalog().getAllAsync<{ id: number; activity: string }>(
    'SELECT id, activity FROM detail WHERE activity IS NOT NULL AND id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(ids)],
  );
  return new Map(rows.map((r) => [r.id, r.activity]));
}

/** Especie del entorno con su recuento del mes; la probabilidad se calcula después, según la franja elegida. */
export type RawCandidate = SpeciesRow & { count: number; activity: string | null };

export async function loadCandidates(
  coords: { lat: number; lng: number },
  month: number,
): Promise<{ items: RawCandidate[]; maxCount: number; fromCache: boolean; fetchedAt: string } | null> {
  const res = await speciesInMonth(coords.lat, coords.lng, month);
  if (!res) return null;
  const ids = res.data.map((n) => n.id);
  const [rows, activity] = await Promise.all([getSpeciesByIds(ids), activityOf(ids)]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: RawCandidate[] = [];
  for (const n of res.data) {
    const row = byId.get(n.id);
    if (row) items.push({ ...row, count: n.count, activity: activity.get(n.id) ?? null });
  }
  return { items, maxCount: Math.max(1, ...res.data.map((n) => n.count)), fromCache: res.fromCache, fetchedAt: res.fetchedAt };
}

export function scoreCandidates(items: RawCandidate[], maxCount: number, phase: DayPhase): Candidate[] {
  return items
    .map((it) => {
      const { p, scheduleKnown } = excursionProbability({ monthCount: it.count, maxMonthCount: maxCount, activity: it.activity, phase });
      return { ...it, p, scheduleKnown };
    })
    .sort((a, b) => b.p - a.p);
}
