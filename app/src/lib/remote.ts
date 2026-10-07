import { journal } from '@/db';

import { USER_AGENT } from './urls';

/*
 * Consultas en vivo a las API públicas (iNaturalist, GBIF), con caché local.
 *
 * Lo que cambia con el tiempo o depende de dónde está el usuario —qué especies
 * se confunden con esta, en qué meses se ve cerca de ti, qué hay en una zona del
 * mapa— no va dentro del catálogo: se pide al abrir la ficha y se guarda unos
 * días en `cuaderno.db`. Sin conexión se usa lo guardado; si no hay nada, la
 * sección no se muestra (nunca se inventa un sustituto).
 */

const UA = USER_AGENT;
const DAY = 86_400_000;

export type Fetched<T> = { data: T; fetchedAt: string; fromCache: boolean };

export async function cachedJson<T>(key: string, url: string, maxAgeDays: number): Promise<Fetched<T> | null> {
  const db = journal();
  const hit = await db.getFirstAsync<{ json: string; fetched_at: string }>(
    'SELECT json, fetched_at FROM cache WHERE key = ?',
    [key],
  );
  const fresh = hit && Date.now() - new Date(hit.fetched_at).getTime() < maxAgeDays * DAY;
  if (hit && fresh) return { data: JSON.parse(hit.json) as T, fetchedAt: hit.fetched_at, fromCache: true };
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as T;
    const fetchedAt = new Date().toISOString();
    await db.runAsync('INSERT OR REPLACE INTO cache (key, json, fetched_at) VALUES (?,?,?)', [
      key,
      JSON.stringify(data),
      fetchedAt,
    ]);
    return { data, fetchedAt, fromCache: false };
  } catch {
    // Sin red o API caída: vale lo guardado aunque esté viejo; si no hay, nada.
    return hit ? { data: JSON.parse(hit.json) as T, fetchedAt: hit.fetched_at, fromCache: true } : null;
  }
}

/* --- iNaturalist ------------------------------------------------------------ */

type InatTaxon = {
  id: number;
  name: string;
  rank: string;
  preferred_common_name?: string;
  default_photo?: { square_url?: string; medium_url?: string; license_code?: string | null; attribution?: string };
};

export type Similar = { id: number; sci: string; name: string | null; count: number };

/**
 * Especies con las que la comunidad de iNaturalist confunde esta: cuántas veces
 * una observación se identificó como la otra y se corrigió. Es el dato más
 * honesto de «cómo distinguirla»: no opina, mide los errores reales.
 */
export async function similarSpecies(taxonId: number): Promise<Fetched<Similar[]> | null> {
  const url =
    `https://api.inaturalist.org/v1/identifications/similar_species?taxon_id=${taxonId}` +
    `&quality_grade=research&locale=es&preferred_place_id=6774`;
  const res = await cachedJson<{ results: { count: number; taxon: InatTaxon }[] }>(`similar:${taxonId}`, url, 30);
  if (!res) return null;
  const list = res.data.results
    .filter((r) => r.taxon.rank === 'species' && !r.taxon.name.includes('×'))
    .slice(0, 8)
    .map((r) => ({ id: r.taxon.id, sci: r.taxon.name, name: r.taxon.preferred_common_name ?? null, count: r.count }));
  return { ...res, data: list };
}

export type Histogram = {
  months: number[];
  /** Observaciones por hora LOCAL del día (0–23) en una muestra al azar. */
  hours: number[];
  /** Tamaño de la muestra horaria (las que traen hora). */
  hoursSample: number;
  total: number;
  scope: 'cerca' | 'mundo';
};

/** Muestra mínima para dibujar la actividad por horas sin engañar. */
export const MIN_HOUR_SAMPLE = 30;

/**
 * Hora local de una marca de iNaturalist (`2023-07-19T19:22:00-06:00` → 19).
 * La API devuelve `time_observed_at` con el desfase de donde se observó, así que
 * las dos cifras tras la «T» ya son la hora local del observador.
 */
export function localHour(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /T(\d{2}):/.exec(iso);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h < 24 ? h : null;
}

/**
 * Cuándo se ve: observaciones confirmadas por mes del año y por hora del día.
 * Con ubicación, en un radio de 300 km (el hemisferio cambia las estaciones);
 * sin ella, en todo el mundo, y la ficha lo dice.
 *
 * El histograma de iNaturalist no tiene «hora del día» (su intervalo `hour` es
 * una serie temporal de las últimas horas), así que la actividad diaria sale de
 * una muestra al azar de hasta 200 observaciones con su hora local.
 */
export async function seasonality(taxonId: number, near?: { lat: number; lng: number }): Promise<Fetched<Histogram> | null> {
  const where = near ? `&lat=${near.lat.toFixed(2)}&lng=${near.lng.toFixed(2)}&radius=300` : '';
  const base = `https://api.inaturalist.org/v1/observations/histogram?taxon_id=${taxonId}&quality_grade=research&captive=false&date_field=observed${where}`;
  const sample = `https://api.inaturalist.org/v2/observations?taxon_id=${taxonId}&quality_grade=research&captive=false${where}&per_page=200&order_by=random&fields=time_observed_at`;
  const key = `season:${taxonId}:${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : 'world'}`;
  const [m, h] = await Promise.all([
    cachedJson<{ results: { month_of_year: Record<string, number> } }>(`${key}:m`, `${base}&interval=month_of_year`, 30),
    cachedJson<{ results: { time_observed_at: string | null }[] }>(`${key}:hl`, sample, 30),
  ]);
  if (!m) return null;
  const months = Array.from({ length: 12 }, (_, i) => m.data.results.month_of_year[String(i + 1)] ?? 0);
  const hours = Array.from({ length: 24 }, () => 0);
  let hoursSample = 0;
  for (const r of h?.data.results ?? []) {
    const hr = localHour(r.time_observed_at);
    if (hr == null) continue;
    hours[hr]++;
    hoursSample++;
  }
  const total = months.reduce((a, b) => a + b, 0);
  return { data: { months, hours, hoursSample, total, scope: near ? 'cerca' : 'mundo' }, fetchedAt: m.fetchedAt, fromCache: m.fromCache };
}

/* --- GBIF ------------------------------------------------------------------- */

export type PlaceCount = { name: string; count: number };

/**
 * Lugares concretos con más observaciones de la especie dentro de un recuadro
 * del mapa. GBIF anota cada registro con su unidad administrativa de GADM hasta
 * el nivel 3 (en España, la comarca); se piden los niveles 3 y 2 (provincia) y
 * se cuentan los registros de cada uno. Es un recuento de registros reales, no
 * una estimación de área.
 */
export async function placesInBox(
  gbifKey: number,
  box: { west: number; south: number; east: number; north: number },
): Promise<Fetched<{ areas: PlaceCount[]; provinces: PlaceCount[]; total: number }> | null> {
  const wkt = `POLYGON((${box.west} ${box.south},${box.east} ${box.south},${box.east} ${box.north},${box.west} ${box.north},${box.west} ${box.south}))`;
  const url =
    `https://api.gbif.org/v1/occurrence/search?taxonKey=${gbifKey}&geometry=${encodeURIComponent(wkt)}` +
    `&basisOfRecord=HUMAN_OBSERVATION&occurrenceStatus=PRESENT&limit=0&facet=gadmLevel3Gid&facet=gadmLevel2Gid&facetLimit=8`;
  const key = `places:${gbifKey}:${[box.west, box.south, box.east, box.north].map((n) => n.toFixed(2)).join(',')}`;
  const res = await cachedJson<{ count: number; facets: { field: string; counts: { name: string; count: number }[] }[] }>(
    key,
    url,
    14,
  );
  if (!res) return null;
  const facet = (field: string) => res.data.facets.find((f) => f.field === field)?.counts ?? [];
  const names = await gadmNames([...facet('GADM_LEVEL_3_GID'), ...facet('GADM_LEVEL_2_GID')].map((c) => c.name));
  const toPlaces = (field: string) =>
    facet(field)
      .map((c) => ({ name: names[c.name] ?? c.name, count: c.count }))
      .filter((p) => p.name);
  return {
    ...res,
    data: { areas: toPlaces('GADM_LEVEL_3_GID'), provinces: toPlaces('GADM_LEVEL_2_GID'), total: res.data.count },
  };
}

async function gadmNames(gids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    gids.map(async (gid) => {
      const r = await cachedJson<{ name: string }>(`gadm:${gid}`, `https://api.gbif.org/v1/geocode/gadm/${gid}`, 365);
      if (r?.data?.name) out[gid] = r.data.name;
    }),
  );
  return out;
}

/* --- Cerca de ti -------------------------------------------------------------- */

export type Nearby = { id: number; count: number };

/**
 * Especies con más observaciones confirmadas a menos de `radiusKm` de un punto.
 * Es lo que de verdad se puede encontrar al salir de casa, y cambia con el
 * lugar: por eso se pide en vivo (caché de una semana por celda de ~10 km).
 */
export async function nearbySpecies(lat: number, lng: number, radiusKm = 10): Promise<Fetched<Nearby[]> | null> {
  const cell = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  const url =
    `https://api.inaturalist.org/v1/observations/species_counts?taxon_id=1&quality_grade=research&captive=false` +
    `&lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}&radius=${radiusKm}&per_page=60`;
  const res = await cachedJson<{ results: { count: number; taxon: { id: number; rank: string } }[] }>(
    `nearby:${cell}:${radiusKm}`,
    url,
    7,
  );
  if (!res) return null;
  return {
    ...res,
    data: res.data.results.filter((r) => r.taxon.rank === 'species').map((r) => ({ id: r.taxon.id, count: r.count })),
  };
}
