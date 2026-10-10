import type { IconName } from '@/components/Icon';

/*
 * Clima en el momento del avistamiento, de Open-Meteo (https://open-meteo.com):
 * sin clave, datos abiertos CC BY 4.0 (hay que citar la fuente) y uso gratuito
 * no comercial hasta 10 000 llamadas al día. Este fichero no importa nada
 * nativo para poder probarse en Jest.
 */

export type Weather = {
  /** Código WMO del estado del cielo. */
  code: number;
  tempC: number;
  feelsC: number | null;
  humidity: number | null;
  windKmh: number | null;
  isDay: boolean;
  /** Instante de la medida (ISO, UTC). */
  at: string;
  /** Lluvia o nieve de la última hora (mm), si se pidió. */
  precipMm?: number | null;
  /** Cielo cubierto (%), si se pidió. */
  cloud?: number | null;
  /** Salida y puesta del sol de hoy (hora local «2026-10-10T08:05»), si se pidieron. */
  sunrise?: string | null;
  sunset?: string | null;
  /** Hora local del lugar al medir («2026-10-10T13:15»). */
  localTime?: string | null;
};

export const WEATHER_CREDIT = 'Datos meteorológicos: Open-Meteo.com (CC BY 4.0)';

/** Estado del cielo y su icono a partir del código WMO (tabla oficial de Open-Meteo). */
export function weatherInfo(code: number, isDay = true): { label: string; icon: IconName } {
  if (code === 0) return isDay ? { label: 'Despejado', icon: 'sun' } : { label: 'Noche despejada', icon: 'moon' };
  if (code === 1) return isDay ? { label: 'Casi despejado', icon: 'sun' } : { label: 'Noche casi despejada', icon: 'moon' };
  if (code === 2) return isDay ? { label: 'Parcialmente nublado', icon: 'cloudSun' } : { label: 'Parcialmente nublado', icon: 'cloud' };
  if (code === 3) return { label: 'Nublado', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Niebla', icon: 'fog' };
  if (code >= 51 && code <= 55) return { label: 'Llovizna', icon: 'rain' };
  if (code === 56 || code === 57) return { label: 'Llovizna helada', icon: 'rain' };
  if (code >= 61 && code <= 65) return { label: code === 61 ? 'Lluvia débil' : code === 63 ? 'Lluvia' : 'Lluvia fuerte', icon: 'rain' };
  if (code === 66 || code === 67) return { label: 'Lluvia helada', icon: 'rain' };
  if (code >= 71 && code <= 75) return { label: code === 71 ? 'Nieve débil' : code === 73 ? 'Nieve' : 'Nieve fuerte', icon: 'snow' };
  if (code === 77) return { label: 'Granos de nieve', icon: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Chubascos', icon: 'rain' };
  if (code === 85 || code === 86) return { label: 'Chubascos de nieve', icon: 'snow' };
  if (code === 95) return { label: 'Tormenta', icon: 'storm' };
  if (code === 96 || code === 99) return { label: 'Tormenta con granizo', icon: 'storm' };
  return { label: 'Tiempo variable', icon: 'cloud' };
}

type OpenMeteoCurrent = {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
    is_day?: number;
    precipitation?: number;
    cloud_cover?: number;
  };
  daily?: { sunrise?: string[]; sunset?: string[] };
};

/** Lee la respuesta de Open-Meteo; `null` si falta lo esencial (nunca inventa un valor). */
export function parseCurrentWeather(json: unknown, now = new Date()): Weather | null {
  const j = json as OpenMeteoCurrent | null;
  const c = j?.current;
  if (!c || typeof c.temperature_2m !== 'number' || typeof c.weather_code !== 'number') return null;
  const extra: Partial<Weather> = {};
  if (typeof c.precipitation === 'number') extra.precipMm = c.precipitation;
  if (typeof c.cloud_cover === 'number') extra.cloud = c.cloud_cover;
  if (j?.daily?.sunrise?.[0]) extra.sunrise = j.daily.sunrise[0];
  if (j?.daily?.sunset?.[0]) extra.sunset = j.daily.sunset[0];
  if (typeof c.time === 'string') extra.localTime = c.time;
  return {
    ...extra,
    code: c.weather_code,
    tempC: c.temperature_2m,
    feelsC: typeof c.apparent_temperature === 'number' ? c.apparent_temperature : null,
    humidity: typeof c.relative_humidity_2m === 'number' ? Math.round(c.relative_humidity_2m) : null,
    windKmh: typeof c.wind_speed_10m === 'number' ? c.wind_speed_10m : null,
    isDay: c.is_day !== 0,
    at: now.toISOString(),
  };
}

export function weatherUrl(lat: number, lng: number): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m&timezone=auto`
  );
}

/** Como `weatherUrl`, con lluvia, nubes y la salida y puesta del sol (para «qué sale con este tiempo»). */
export function weatherNowUrl(lat: number, lng: number): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,precipitation,cloud_cover` +
    `&daily=sunrise,sunset&forecast_days=1&timezone=auto`
  );
}

/** Clima actual en un punto. Corta a los 6 s y devuelve `null` sin red: nunca bloquea. */
export async function fetchWeather(lat: number, lng: number, timeoutMs = 6000): Promise<Weather | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(weatherUrl(lat, lng), { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return parseCurrentWeather(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Columnas de `sighting` donde se guarda el clima (ver migración 3 de `db/journal.ts`). */
export type WeatherFields = {
  weather_code: number | null;
  weather_temp: number | null;
  weather_feels: number | null;
  weather_humidity: number | null;
  weather_wind: number | null;
  weather_is_day: number | null;
  weather_at: string | null;
};

export function weatherToFields(w: Weather): WeatherFields {
  return {
    weather_code: w.code,
    weather_temp: w.tempC,
    weather_feels: w.feelsC,
    weather_humidity: w.humidity,
    weather_wind: w.windKmh,
    weather_is_day: w.isDay ? 1 : 0,
    weather_at: w.at,
  };
}

export function weatherFromFields(f: Partial<WeatherFields>): Weather | null {
  if (f.weather_code == null || f.weather_temp == null) return null;
  return {
    code: f.weather_code,
    tempC: f.weather_temp,
    feelsC: f.weather_feels ?? null,
    humidity: f.weather_humidity ?? null,
    windKmh: f.weather_wind ?? null,
    isDay: f.weather_is_day !== 0,
    at: f.weather_at ?? '',
  };
}
