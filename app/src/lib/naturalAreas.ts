import { cachedJson, type Fetched } from './remote';

/*
 * ¿En qué bosque, parque o espacio protegido concreto se ha visto?
 *
 * Al tocar el Atlas:
 *   1. OpenStreetMap (Overpass) da los espacios naturales con nombre de la zona
 *      —parques nacionales y naturales, reservas, bosques, humedales, parques
 *      urbanos— con su contorno.
 *   2. GBIF da los puntos de las observaciones humanas de la especie en la misma
 *      zona (solo los de posición precisa, ±1 km como mucho).
 *   3. Se cuenta qué puntos caen dentro de cada contorno.
 *
 * Solo se nombra un espacio si de verdad contiene observaciones: no basta con
 * que esté cerca. Con la zona demasiado grande no se calcula (sería lento y el
 * recuento de 300 puntos dejaría de ser representativo): se pide acercar.
 */

export type NaturalArea = { name: string; kind: string; count: number };

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const MAX_SPAN = 0.35; // grados: ~35 km
const MAX_POINTS = 300;

type Box = { west: number; south: number; east: number; north: number };
export type Pt = [number, number]; // [lng, lat]

type OsmGeom = { lat: number; lon: number }[];
export type OsmElement = {
  type: 'way' | 'relation';
  tags?: Record<string, string>;
  geometry?: OsmGeom;
  members?: { type: string; role: string; geometry?: OsmGeom }[];
};

export function tooLarge(box: Box): boolean {
  return box.east - box.west > MAX_SPAN || box.north - box.south > MAX_SPAN;
}

function kindOf(tags: Record<string, string>): string | null {
  if (tags.boundary === 'national_park' || tags.protect_class === '2') return 'Parque nacional';
  if (tags.boundary === 'protected_area') return tags['protection_title'] ?? 'Espacio protegido';
  if (tags.leisure === 'nature_reserve') return 'Reserva natural';
  if (tags.landuse === 'forest' || tags.natural === 'wood') return 'Bosque';
  if (tags.natural === 'wetland') return 'Humedal';
  if (tags.leisure === 'park') return 'Parque';
  return null;
}

/** Anillos cerrados de una vía o de los miembros «outer» de una relación. */
export function rings(el: OsmElement): Pt[][] {
  const toPts = (g: OsmGeom): Pt[] => g.map((p) => [p.lon, p.lat]);
  if (el.type === 'way') return el.geometry && el.geometry.length > 3 ? [toPts(el.geometry)] : [];
  const parts = (el.members ?? []).filter((m) => m.role === 'outer' && m.geometry && m.geometry.length > 1).map((m) => toPts(m.geometry!));
  // Encadenar trozos por sus extremos hasta cerrar cada anillo.
  const out: Pt[][] = [];
  const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
  while (parts.length) {
    let ring = parts.shift()!;
    let grown = true;
    while (!same(ring[0], ring[ring.length - 1]) && grown) {
      grown = false;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const end = ring[ring.length - 1];
        if (same(end, p[0])) ring = ring.concat(p.slice(1));
        else if (same(end, p[p.length - 1])) ring = ring.concat([...p].reverse().slice(1));
        else continue;
        parts.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring.length > 3) out.push(ring);
  }
  return out;
}

export function inside(pt: Pt, ring: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export type NaturalAreas = { areas: NaturalArea[]; sampled: number; total: number };

export async function naturalAreasWithSpecies(gbifKey: number, box: Box): Promise<Fetched<NaturalAreas> | null> {
  if (tooLarge(box)) return null;
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  const q =
    `[out:json][timeout:20];(` +
    ['boundary=national_park', 'boundary=protected_area', 'leisure=nature_reserve', 'landuse=forest', 'natural=wood', 'natural=wetland', 'leisure=park']
      .map((t) => {
        const [k, v] = t.split('=');
        return `way["${k}"="${v}"]["name"](${bbox});relation["${k}"="${v}"]["name"](${bbox});`;
      })
      .join('') +
    `);out geom;`;
  const key = `osm-areas:${[box.west, box.south, box.east, box.north].map((n) => n.toFixed(2)).join(',')}`;
  const osm = await cachedJson<{ elements: OsmElement[] }>(key, `${OVERPASS}?data=${encodeURIComponent(q)}`, 30);

  const wkt = `POLYGON((${box.west} ${box.south},${box.east} ${box.south},${box.east} ${box.north},${box.west} ${box.north},${box.west} ${box.south}))`;
  const occ = await cachedJson<{
    count: number;
    results: { decimalLongitude?: number; decimalLatitude?: number; coordinateUncertaintyInMeters?: number }[];
  }>(
    `pts:${gbifKey}:${key}`,
    `https://api.gbif.org/v1/occurrence/search?taxonKey=${gbifKey}&geometry=${encodeURIComponent(wkt)}` +
      `&basisOfRecord=HUMAN_OBSERVATION&occurrenceStatus=PRESENT&hasCoordinate=true&hasGeospatialIssue=false&limit=${MAX_POINTS}`,
    14,
  );
  if (!osm || !occ) return null;

  const points: Pt[] = occ.data.results
    .filter((r) => r.decimalLongitude != null && r.decimalLatitude != null && (r.coordinateUncertaintyInMeters ?? 0) <= 1000)
    .map((r) => [r.decimalLongitude!, r.decimalLatitude!]);

  const byName = new Map<string, NaturalArea>();
  for (const el of osm.data.elements) {
    const tags = el.tags ?? {};
    const kind = kindOf(tags);
    const name = tags['name:es'] ?? tags.name;
    if (!kind || !name) continue;
    const rs = rings(el);
    if (!rs.length) continue;
    const count = points.filter((p) => rs.some((r) => inside(p, r))).length;
    if (count === 0) continue;
    const prev = byName.get(name);
    if (!prev || prev.count < count) byName.set(name, { name, kind, count });
  }
  const areas = [...byName.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  return {
    data: { areas, sampled: points.length, total: occ.data.count },
    fetchedAt: occ.fetchedAt,
    fromCache: occ.fromCache && osm.fromCache,
  };
}
