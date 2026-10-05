import { getSpeciesByIds, type SpeciesRow } from '@/db/catalog';

import { cachedJson, type Fetched } from './remote';

/*
 * Rarezas cerca: especies raras o legendarias del catálogo (por número de
 * observaciones confirmadas en todo el mundo, ver RARITY en groups.ts) que la
 * comunidad de iNaturalist ha visto y confirmado cerca hace poco.
 *
 * Es un dato real (observaciones con «grado de investigación»), no una
 * predicción. iNaturalist oculta solo la ubicación exacta de las especies
 * sensibles, así que no se señala ningún sitio: solo «a menos de N km».
 */

export const RARE_TIER = 4;
export const RARITY_RADIUS_KM = 50;
export const RARITY_DAYS = 14;

export type RareFind = SpeciesRow & { seen: number };

/** Fecha `AAAA-MM-DD` de hace `days` días (hora local). */
export function sinceDate(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 86_400_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Deja las raras que no tienes, de la más rara a la menos, y por veces vista. */
/** Lo que ya tienes: un Set de ids o el mapa `caught` del cuaderno. */
export type Owned = { has(id: number): boolean };

export function pickRarities(rows: SpeciesRow[], counts: Map<number, number>, caught: Owned, minTier = RARE_TIER): RareFind[] {
  return rows
    .filter((r) => r.rarity >= minTier && !caught.has(r.id))
    .map((r) => ({ ...r, seen: counts.get(r.id) ?? 0 }))
    .sort((a, b) => b.rarity - a.rarity || b.seen - a.seen);
}

/**
 * Rarezas confirmadas a menos de `RARITY_RADIUS_KM` en los últimos
 * `RARITY_DAYS` días. Se cachea seis horas (la tarjeta de Inicio y la tarea en
 * segundo plano comparten la consulta).
 */
export async function nearbyRarities(lat: number, lng: number, caught: Owned): Promise<Fetched<RareFind[]> | null> {
  const la = lat.toFixed(2);
  const ln = lng.toFixed(2);
  const d1 = sinceDate(RARITY_DAYS);
  const url =
    `https://api.inaturalist.org/v1/observations/species_counts?lat=${la}&lng=${ln}&radius=${RARITY_RADIUS_KM}` +
    `&d1=${d1}&quality_grade=research&captive=false&taxon_id=1&per_page=500`;
  const res = await cachedJson<{ results: { count: number; taxon: { id: number } }[] }>(`rarities:${la},${ln}:${d1}`, url, 0.25);
  if (!res) return null;
  const counts = new Map(res.data.results.map((r) => [r.taxon.id, r.count]));
  const rows = await getSpeciesByIds([...counts.keys()]);
  return { ...res, data: pickRarities(rows, counts, caught) };
}
