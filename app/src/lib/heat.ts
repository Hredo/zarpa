/*
 * Mapa de calor personal del Atlas: puntos de tus avistamientos y «zonas sin
 * explorar» a tu alrededor. Lógica pura (sin mapa ni base de datos).
 *
 * Una zona sin explorar es una celda de una malla fija de ~2,5 km, dentro del
 * radio elegido alrededor de tu posición, donde NO hay ningún avistamiento
 * tuyo. No sabe si la celda es mar, ciudad o finca privada: es solo «aquí aún
 * no has fichado nada», y el Atlas lo dice así.
 */

export type LatLng = { lat: number; lng: number };
/** [oeste, sur, este, norte] */
export type Cell = [number, number, number, number];

const KM_PER_DEG_LAT = 111.32;

export function haversineKm(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function unexploredCells(
  center: LatLng,
  visited: LatLng[],
  opts: { radiusKm?: number; cellKm?: number; max?: number } = {},
): Cell[] {
  const radiusKm = opts.radiusKm ?? 20;
  const cellKm = opts.cellKm ?? 2.5;
  const max = opts.max ?? 12;
  const dLat = cellKm / KM_PER_DEG_LAT;
  // Los grados de longitud se acortan con la latitud; se fija por la del centro para que la malla sea estable.
  const dLng = cellKm / (KM_PER_DEG_LAT * Math.max(0.05, Math.cos((center.lat * Math.PI) / 180)));
  const key = (i: number, j: number) => `${i}:${j}`;
  const seen = new Set(visited.map((p) => key(Math.floor(p.lat / dLat), Math.floor(p.lng / dLng))));

  const i0 = Math.floor((center.lat - radiusKm / KM_PER_DEG_LAT) / dLat);
  const i1 = Math.floor((center.lat + radiusKm / KM_PER_DEG_LAT) / dLat);
  const j0 = Math.floor((center.lng - (radiusKm / KM_PER_DEG_LAT) * (dLng / dLat)) / dLng);
  const j1 = Math.floor((center.lng + (radiusKm / KM_PER_DEG_LAT) * (dLng / dLat)) / dLng);

  const out: { cell: Cell; d: number }[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      if (seen.has(key(i, j))) continue;
      const south = i * dLat;
      const west = j * dLng;
      const mid = { lat: south + dLat / 2, lng: west + dLng / 2 };
      const d = haversineKm(center, mid);
      if (d > radiusKm) continue;
      out.push({ cell: [west, south, west + dLng, south + dLat], d });
    }
  }
  return out.sort((a, b) => a.d - b.d).slice(0, max).map((o) => o.cell);
}
