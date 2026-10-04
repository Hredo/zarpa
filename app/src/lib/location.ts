import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type Coords = { lat: number; lng: number; accuracy: number | null };

/**
 * Última posición conocida, **sin pedir permiso**. Las pantallas de consulta
 * (ficha, Rastro) la usan si el usuario ya la concedió al avistar; pedirla al
 * abrir una ficha sería una interrupción sin motivo visible.
 */
export function useLastLocation(): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 });
      if (alive && pos) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return coords;
}

/** Posición actual, pidiendo permiso si hace falta (al fichar). */
export async function currentLocation(): Promise<Coords | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude, accuracy: last.coords.accuracy } : null;
  }
}

/** País de unas coordenadas, con el geocodificador del sistema. */
export async function countryOf(c: { lat: number; lng: number }): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng });
    return place?.isoCountryCode ?? null;
  } catch {
    return null;
  }
}

/** Nombre corto del lugar («Sant Vicent del Raspeig, Alicante») para el cromo. */
export async function placeName(c: { lat: number; lng: number }): Promise<string | null> {
  try {
    const [p] = await Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng });
    if (!p) return null;
    const parts = [p.city ?? p.subregion ?? p.district, p.region].filter(Boolean);
    return parts.length ? [...new Set(parts)].join(', ') : null;
  } catch {
    return null;
  }
}
