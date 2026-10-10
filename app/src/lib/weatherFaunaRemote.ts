import { getFaunaByIds, type FaunaRow } from '@/db/catalog';

import { cachedJson } from './remote';
import { parseCurrentWeather, weatherInfo, weatherNowUrl, type Weather } from './weather';
import { conditionsOf, rankByWeather, seasonMonths, weatherHeadline, type Conditions, type Ranked } from './weatherFauna';

/*
 * Peticiones de «El tiempo hoy» (ver `weatherFauna.ts`): el clima de ahora de
 * Open-Meteo (caché de media hora por celda de ~1 km) y las especies vistas
 * cerca en esta época en iNaturalist (caché de tres días por celda de ~10 km).
 */

export const FAUNA_RADIUS_KM = 25;

export type WeatherFauna = {
  weather: Weather;
  conditions: Conditions;
  headline: string;
  species: Ranked<FaunaRow>[];
  /** false si no se pudo saber qué se ve por la zona (sin red): solo hay clima. */
  hasSpecies: boolean;
};

async function weatherNow(lat: number, lng: number): Promise<Weather | null> {
  const half = Math.floor(Date.now() / 1_800_000);
  const res = await cachedJson<unknown>(`wxnow:${lat.toFixed(2)},${lng.toFixed(2)}:${half}`, weatherNowUrl(lat, lng), 1 / 48);
  return res ? parseCurrentWeather(res.data, new Date(res.fetchedAt)) : null;
}

async function seasonalNearby(lat: number, lng: number): Promise<Map<number, number> | null> {
  const months = seasonMonths();
  const url =
    `https://api.inaturalist.org/v1/observations/species_counts?taxon_id=1&quality_grade=research&captive=false` +
    `&lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}&radius=${FAUNA_RADIUS_KM}&month=${months.join(',')}&per_page=300`;
  const res = await cachedJson<{ results: { count: number; taxon: { id: number; rank: string } }[] }>(
    `season-near:${lat.toFixed(1)},${lng.toFixed(1)}:${months[1]}`,
    url,
    3,
  );
  if (!res) return null;
  return new Map(res.data.results.filter((r) => r.taxon.rank === 'species').map((r) => [r.taxon.id, r.count]));
}

/** El tiempo de ahora y los animales de la zona que es buen momento para ver. `null` sin clima. */
export async function weatherFauna(lat: number, lng: number, owned: { has(id: number): boolean }): Promise<WeatherFauna | null> {
  const [weather, counts] = await Promise.all([weatherNow(lat, lng), seasonalNearby(lat, lng).catch(() => null)]);
  if (!weather) return null;
  const conditions = conditionsOf(weather);
  const rows = counts ? await getFaunaByIds([...counts.keys()]) : [];
  const species = counts ? rankByWeather(rows, counts, conditions, owned) : [];
  return {
    weather,
    conditions,
    species,
    hasSpecies: counts !== null,
    headline: weatherHeadline(weatherInfo(weather.code, weather.isDay).label, conditions, species),
  };
}
