import { catalog } from '@/db';
import { getSpeciesByIds, type SpeciesRow } from '@/db/catalog';

import { classifyMonth, prevMonth, type Counts, type Entry } from './calendarLogic';
import { cachedJson } from './remote';

/*
 * Datos del calendario: solo iNaturalist (observaciones confirmadas en
 * libertad) y el catálogo. Región = 150 km alrededor de tu última posición, o
 * todo el mundo si no hay ubicación. Caché de una semana.
 */

export const REGION_KM = 150;
type Near = { lat: number; lng: number } | null;

const where = (near: Near) => (near ? `&lat=${near.lat.toFixed(2)}&lng=${near.lng.toFixed(2)}&radius=${REGION_KM}` : '');
const cell = (near: Near) => (near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : 'world');

/** Observaciones de animales por mes del año (12 valores). */
export async function monthlyActivity(near: Near): Promise<number[] | null> {
  const url =
    `https://api.inaturalist.org/v1/observations/histogram?taxon_id=1&quality_grade=research&captive=false` +
    `&date_field=observed&interval=month_of_year${where(near)}`;
  const res = await cachedJson<{ results: { month_of_year: Record<string, number> } }>(`cal:act:${cell(near)}`, url, 7);
  if (!res) return null;
  return Array.from({ length: 12 }, (_, i) => res.data.results.month_of_year[String(i + 1)] ?? 0);
}

async function speciesCounts(near: Near, month: number | null, perPage: number): Promise<Counts | null> {
  const url =
    `https://api.inaturalist.org/v1/observations/species_counts?taxon_id=1&quality_grade=research&captive=false` +
    `${month ? `&month=${month}` : ''}&per_page=${perPage}${where(near)}`;
  const res = await cachedJson<{ results: { count: number; taxon: { id: number; rank: string } }[] }>(
    `cal:sp:${cell(near)}:${month ?? 'year'}`,
    url,
    7,
  );
  if (!res) return null;
  return new Map(res.data.results.filter((r) => r.taxon.rank === 'species').map((r) => [r.taxon.id, r.count]));
}

export type CalendarEntry = Entry & { species: SpeciesRow; migration: string | null };
export type MonthReport = { peak: CalendarEntry[]; arriving: CalendarEntry[]; leaving: CalendarEntry[]; migratory: CalendarEntry[] };

async function migrationOf(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await catalog().getAllAsync<{ id: number; migration: string }>(
    'SELECT id, migration FROM detail WHERE migration IS NOT NULL AND id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(ids)],
  );
  return new Map(rows.map((r) => [r.id, r.migration]));
}

/** Qué pasa en `month` (1–12): especies en pico, que aparecen, que se despiden y migradoras en pico. */
export async function monthReport(near: Near, month: number): Promise<MonthReport | null> {
  const [m, p, y] = await Promise.all([speciesCounts(near, month, 200), speciesCounts(near, prevMonth(month), 200), speciesCounts(near, null, 500)]);
  if (!m || !p || !y) return null;
  const { peak, arriving, leaving } = classifyMonth(m, p, y);
  const top = (list: Entry[]) => list.slice(0, 12);
  const wanted = [...new Set([...top(peak), ...top(arriving), ...top(leaving)].map((e) => e.id))];
  const [rows, migration] = await Promise.all([getSpeciesByIds(wanted), migrationOf(wanted)]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const dress = (list: Entry[]): CalendarEntry[] =>
    top(list)
      .filter((e) => byId.has(e.id))
      .map((e) => ({ ...e, species: byId.get(e.id)!, migration: migration.get(e.id) ?? null }));
  const peakD = dress(peak);
  return {
    peak: peakD,
    arriving: dress(arriving),
    leaving: dress(leaving),
    migratory: peakD.filter((e) => e.migration && /migrador/i.test(e.migration)),
  };
}
