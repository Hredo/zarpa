/*
 * Cuentas del modo sin conexión (puras, sin red ni módulos nativos).
 *
 * Teselas: el mapa base del Atlas es OpenFreeMap (vectoriales, zoom máximo 14).
 * Sus condiciones de uso prohíben recoger datos del servicio de forma
 * automatizada sin permiso, así que NO se descarga una región grande: solo un
 * radio pequeño (3, 5 u 8 km) y de zoom 10 a 14, con 4 peticiones a la vez.
 * Es el equivalente a recorrer ese mapa con el dedo.
 */
import type { LatLng } from './heat';

export type Tile = { z: number; x: number; y: number };

export const OFFLINE_RADII_KM = [3, 5, 8] as const;
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 14;

/** Medidas reales (octubre 2026): teselas gzip de 44 a 142 kB en la costa de Alicante. */
export const AVG_TILE_BYTES = 70_000;
/** Media de 12 fotos `medium` de iNaturalist del catálogo (80–300 kB). */
export const AVG_PHOTO_BYTES = 150_000;
/** Estilo, iconos y rótulos del mapa (aprox.). */
export const MAP_ASSETS_BYTES = 400_000;

export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latR = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

/** Teselas que cubren un cuadrado de ±`radiusKm` alrededor del punto, por nivel de zoom. */
export function tilesForArea(center: LatLng, radiusKm: number, minZoom = MIN_ZOOM, maxZoom = MAX_ZOOM): Tile[] {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.05, Math.cos((center.lat * Math.PI) / 180)));
  const tiles: Tile[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const a = lngLatToTile(center.lng - dLng, center.lat + dLat, z);
    const b = lngLatToTile(center.lng + dLng, center.lat - dLat, z);
    for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) tiles.push({ z, x, y });
  }
  return tiles;
}

export type DownloadEstimate = { tiles: number; photos: number; bytes: number; tileBytes: number; photoBytes: number };

export function estimateDownload(tileCount: number, photoCount: number): DownloadEstimate {
  const tileBytes = tileCount * AVG_TILE_BYTES + (tileCount > 0 ? MAP_ASSETS_BYTES : 0);
  const photoBytes = photoCount * AVG_PHOTO_BYTES;
  return { tiles: tileCount, photos: photoCount, tileBytes, photoBytes, bytes: tileBytes + photoBytes };
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} kB`;
  const mb = bytes / 1_000_000;
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} MB`;
}
