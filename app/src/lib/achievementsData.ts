import type { CaughtSpecies, StatsInput } from './achievements';
import type { Reader } from './speciesMatch';

/*
 * Lectura de las bases para los logros. Tres consultas al cuaderno (especies
 * distintas, fechas, lugares) y una al catálogo (rareza, grupo y UICN de esas
 * especies), todas agregadas: no se recorre el catálogo de 266 000 filas ni se
 * traen las fotos.
 */

type City = { lat: number; lng: number; cc: string };

/** Distancia en km (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Radio máximo para dar un punto por «de» una ciudad del catálogo. */
export const CITY_RADIUS_KM = 250;

/**
 * Países de unos puntos sin geocodificador (funciona sin conexión): el de la
 * ciudad del catálogo más cercana si está a menos de `CITY_RADIUS_KM`. Es una
 * aproximación; si el cuaderno guarda el país en el avistamiento, se usa ese.
 */
export function countriesOfPoints(points: { lat: number; lng: number }[], cities: City[]): string[] {
  const found = new Set<string>();
  for (const p of points) {
    let best: City | null = null;
    let bestKm = CITY_RADIUS_KM;
    for (const c of cities) {
      // Descarte barato antes del haversine: 3° de latitud ≈ 333 km.
      if (Math.abs(c.lat - p.lat) > 3) continue;
      const km = distanceKm(p, c);
      if (km < bestKm) {
        best = c;
        bestKm = km;
      }
    }
    if (best) found.add(best.cc);
  }
  return [...found];
}

async function sightingCountryColumn(journal: Reader): Promise<string | null> {
  const cols = await journal.getAllAsync<{ name: string }>('PRAGMA table_info(sighting)', []);
  const names = new Set(cols.map((c) => c.name));
  return names.has('cc') ? 'cc' : names.has('country') ? 'country' : null;
}

export async function loadStatsInput(journal: Reader, catalog: Reader): Promise<StatsInput> {
  const caught = await journal.getAllAsync<{ species_id: number }>(
    'SELECT DISTINCT species_id FROM sighting WHERE species_id IS NOT NULL',
    [],
  );
  const times = await journal.getAllAsync<{ created_at: string }>('SELECT created_at FROM sighting', []);

  const species = caught.length
    ? await catalog.getAllAsync<CaughtSpecies>(
        'SELECT id, grp, rarity, iucn FROM species WHERE id IN (SELECT value FROM json_each(?))',
        [JSON.stringify(caught.map((r) => r.species_id))],
      )
    : [];

  let countries: string[] = [];
  const col = await sightingCountryColumn(journal);
  if (col) {
    const rows = await journal.getAllAsync<{ cc: string }>(`SELECT DISTINCT ${col} AS cc FROM sighting WHERE ${col} IS NOT NULL`, []);
    countries = rows.map((r) => r.cc);
  }
  if (!countries.length) {
    const points = await journal.getAllAsync<{ lat: number; lng: number }>(
      'SELECT DISTINCT ROUND(lat, 1) AS lat, ROUND(lng, 1) AS lng FROM sighting WHERE lat IS NOT NULL AND lng IS NOT NULL',
      [],
    );
    if (points.length) {
      const cities = await catalog.getAllAsync<City>('SELECT lat, lng, cc FROM city', []);
      countries = countriesOfPoints(points, cities);
    }
  }
  return { species, times: times.map((t) => t.created_at), countries };
}
