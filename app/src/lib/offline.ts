import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';

import { NET_HEADERS } from './urls';

export * from './offlineMath';

/*
 * Uso sin conexión en el campo. Dos piezas:
 *
 *   - Fotos de las especies de la zona: se precargan en la caché de disco de
 *     expo-image (`Image.prefetch`), que es la misma que usan las listas y las
 *     fichas, así que luego se ven sin red.
 *   - Mapa base: lo precarga el propio mapa (`MapCanvas.warmTiles`) en la
 *     caché HTTP del WebView. Aquí solo se calcula qué teselas hacen falta.
 *
 * Las zonas descargadas se recuerdan en AsyncStorage solo para enseñarlas;
 * expo-image no permite borrar fotos sueltas (solo toda la caché), por eso no
 * hay «borrar zona» que libere espacio: la caché se recicla sola.
 */

export type OfflineZone = {
  id: string;
  lat: number;
  lng: number;
  radiusKm: number;
  place: string | null;
  at: string;
  photos: number;
  photosFailed: number;
  tiles: number;
  tilesFailed: number;
  mapOk: boolean;
};

const KEY = 'zarpa.offline.zones.v1';

export async function listZones(): Promise<OfflineZone[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OfflineZone[]) : [];
  } catch {
    return [];
  }
}

export async function saveZone(zone: OfflineZone): Promise<void> {
  const all = (await listZones()).filter((z) => z.id !== zone.id);
  await AsyncStorage.setItem(KEY, JSON.stringify([zone, ...all].slice(0, 12)));
}

export async function removeZoneRecord(id: string): Promise<void> {
  const all = (await listZones()).filter((z) => z.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}

/** Precarga fotos de 4 en 4; cuenta las que fallaron en vez de abortar. */
export async function prefetchPhotos(
  urls: string[],
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean,
): Promise<{ ok: number; failed: number }> {
  let next = 0;
  let ok = 0;
  let failed = 0;
  const total = urls.length;
  const worker = async () => {
    while (!cancelled()) {
      const i = next++;
      if (i >= total) return;
      try {
        if (await Image.prefetch(urls[i], { cachePolicy: 'disk', headers: NET_HEADERS })) ok++;
        else failed++;
      } catch {
        failed++;
      }
      onProgress(ok + failed, total);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { ok, failed };
}
