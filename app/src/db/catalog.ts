import { ensureCountries, speciesExtra } from './catalogDetail';
import type { ShardEntry } from './catalogRemote';
import { catalog, journal } from './index';
import {
  BREED_COLUMNS,
  breedWhere,
  buildCountQuery,
  buildListQuery,
  LIST_COLUMNS,
  type Authority,
  type BreedQuery,
  type Context,
  type Filters,
  type SortKey,
  type SpeciesRow,
} from './query';

export type { Authority, BreedQuery, SpeciesRow } from './query';

export type SpeciesDetail = SpeciesRow & {
  class_sci: string | null;
  order_sci: string | null;
  genus_sci: string | null;
  class_es: string | null;
  order_es: string | null;
  family_es: string | null;
  medium: number;
  diet: string | null;
  repro: string | null;
  domestic: number;
  envs: number;
  gbif: number | null;
  wd: string | null;
  worms: number | null;
  eswiki: string | null;
  enwiki: string | null;
  taxo: string;
  gbif_name: string | null;
  summary: string | null;
  summary_lang: string | null;
  summary_src: string | null;
  aliases_es: string | null;
  diet_detail: string | null;
  activity: string | null;
  migration: string | null;
  /** JSON [[id de ciudad, observaciones], …] */
  cities: string | null;
  cities_n: number | null;
  /**
   * false si la parte de la ficha que vive en el servidor (resumen, galería,
   * países, fuentes…) no se pudo bajar: sin red y sin copia guardada.
   */
  complete: boolean;
};

export type SpeciesImage = {
  rank: number;
  url: string;
  ratio: number | null;
  author: string | null;
  license: string | null;
  source: 'commons' | 'inat';
  page: string | null;
};

export type Provenance = { field: string; sources: string; note: string | null };
export type Source = { code: string; label: string; url: string | null; license: string | null; retrieved: string | null };
export type CountryPresence = { cc: string; obs: number; means: string | null };

export async function journalContext(): Promise<Context> {
  const db = journal();
  const caught = await db.getAllAsync<{ species_id: number }>(
    'SELECT DISTINCT species_id FROM sighting WHERE species_id IS NOT NULL',
  );
  const saved = await db.getAllAsync<{ species_id: number }>('SELECT species_id FROM saved');
  return { caughtIds: caught.map((r) => r.species_id), savedIds: saved.map((r) => r.species_id) };
}

export async function listSpecies(
  f: Filters,
  ctx: Context,
  sort: SortKey,
  limit: number,
  offset: number,
): Promise<SpeciesRow[]> {
  // El filtro por país usa la lista de cada país, que se baja la primera vez.
  if (f.countries.length) await ensureCountries(f.countries);
  const { sql, params } = buildListQuery(f, ctx, sort, limit, offset);
  return catalog().getAllAsync<SpeciesRow>(sql, params);
}

export async function countSpecies(f: Filters, ctx: Context): Promise<number> {
  if (f.countries.length) await ensureCountries(f.countries);
  const { sql, params } = buildCountQuery(f, ctx);
  const row = await catalog().getFirstAsync<{ n: number }>(sql, params);
  return row?.n ?? 0;
}

/** Campos de la ficha que vienen del servidor, vacíos mientras no lleguen. */
const REMOTE_EMPTY = {
  summary_src: null,
  aliases_es: null,
  diet_detail: null,
  cities: null,
  cities_n: null,
  wd: null,
  worms: null,
  eswiki: null,
  enwiki: null,
  taxo: 'accepted',
  gbif_name: null,
};

/**
 * Ficha de una especie: lo del índice (nombre, grupo, rareza, foto…) y lo que
 * trae su trozo de Hosting (resumen, enlaces, ciudades…). Sin red y sin copia
 * guardada, sale lo del índice con `complete: false`.
 */
export async function getSpecies(id: number): Promise<SpeciesDetail | null> {
  const [base, extra] = await Promise.all([
    catalog().getFirstAsync<Omit<SpeciesDetail, keyof typeof REMOTE_EMPTY | 'complete'>>(
      `SELECT s.*, d.summary, d.summary_lang, d.activity, d.migration
       FROM species_v s LEFT JOIN detail d ON d.id = s.id WHERE s.id = ?`,
      [id],
    ),
    speciesExtra(id),
  ]);
  if (!base) return null;
  return { ...REMOTE_EMPTY, ...base, ...(extra?.d ?? {}), complete: extra !== null } as SpeciesDetail;
}

export async function getSpeciesByIds(ids: number[]): Promise<SpeciesRow[]> {
  if (ids.length === 0) return [];
  return catalog().getAllAsync<SpeciesRow>(
    `SELECT ${LIST_COLUMNS} FROM species_v s WHERE s.id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(ids)],
  );
}

/** Galería con autoría y licencia (del trozo de Hosting; vacía sin red). */
export async function getImages(id: number): Promise<SpeciesImage[]> {
  return imagesOf(await speciesExtra(id));
}

export function imagesOf(extra: ShardEntry | null): SpeciesImage[] {
  return (extra?.i ?? []).map(([rank, url, ratio, author, license, source, page]) => ({ rank, url, ratio, author, license, source, page }));
}

export async function getProvenance(id: number): Promise<Provenance[]> {
  return (await speciesExtra(id))?.p?.map(([field, sources, note]) => ({ field, sources, note })) ?? [];
}

export async function getSources(): Promise<Source[]> {
  return catalog().getAllAsync<Source>('SELECT * FROM source');
}

export async function getCountries(id: number): Promise<CountryPresence[]> {
  return (await speciesExtra(id))?.c?.map(([cc, obs, means]) => ({ cc, obs, means })) ?? [];
}

export async function groupTotals(): Promise<{ code: string; label: string; total: number }[]> {
  return catalog().getAllAsync('SELECT code, label, total FROM grp ORDER BY position');
}

export async function catalogMeta(): Promise<Record<string, string>> {
  const rows = await catalog().getAllAsync<{ key: string; value: string }>('SELECT key, value FROM meta');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Especies más observadas en un país: el «qué puedes encontrar aquí». */
export async function topInCountry(cc: string, limit: number): Promise<(SpeciesRow & { local_obs: number })[]> {
  await ensureCountries([cc]);
  return catalog().getAllAsync(
    `SELECT ${LIST_COLUMNS}, c.obs AS local_obs FROM country c JOIN species_v s ON s.id = c.id
     WHERE c.cc = ? ORDER BY c.obs DESC LIMIT ?`,
    [cc, limit],
  );
}

export type AtlasSpecies = { id: number; sci: string; name_es: string | null; gbif: number | null; img: string | null; grp: string };

/** Lo que necesita el Atlas de cada especie guardada (su clave de GBIF pinta la capa). */
export async function getAtlasSpecies(ids: number[]): Promise<AtlasSpecies[]> {
  if (ids.length === 0) return [];
  return catalog().getAllAsync<AtlasSpecies>(
    'SELECT id, sci, name_es, gbif, img, grp FROM species WHERE id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(ids)],
  );
}

/* --- Razas ------------------------------------------------------------------ */

export type BreedRow = {
  id: string;
  species_id: number;
  authority: Authority;
  code: string | null;
  name: string;
  grp: string | null;
  status: string | null;
  adapt: string | null;
  risk: string | null;
  origin_cc: string | null;
  origin_text: string | null;
  countries: string | null;
  img: string | null;
};

export type Breed = BreedRow & {
  rid: number;
  name_official: string | null;
  names_other: string | null;
  section: string | null;
  accepted: string | null;
  origin_place: string | null;
  distribution: string | null;
  varieties: string | null;
  url: string;
  standard_url: string | null;
  img_ratio: number | null;
  img_author: string | null;
  img_license: string | null;
  img_page: string | null;
  wd: string | null;
  retrieved: string | null;
};

export async function listBreeds(speciesId: number, query: BreedQuery, limit: number, offset: number): Promise<BreedRow[]> {
  const { where, params } = breedWhere(speciesId, query);
  return catalog().getAllAsync<BreedRow>(`SELECT ${BREED_COLUMNS} FROM breed b ${where} ORDER BY b.seq LIMIT ? OFFSET ?`, [
    ...params,
    limit,
    offset,
  ]);
}

export async function countBreeds(speciesId: number, query: BreedQuery): Promise<number> {
  const { where, params } = breedWhere(speciesId, query);
  const row = await catalog().getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM breed b ${where}`, params);
  return row?.n ?? 0;
}

/** Cuántas razas tiene la especie, por autoridad. */
export async function breedTotals(speciesId: number): Promise<Partial<Record<Authority, number>>> {
  const rows = await catalog().getAllAsync<{ authority: Authority; n: number }>(
    'SELECT authority, COUNT(*) AS n FROM breed WHERE species_id = ? GROUP BY authority',
    [speciesId],
  );
  return Object.fromEntries(rows.map((r) => [r.authority, r.n]));
}

/** Razas por su número estable (el que usa el índice de razas de la IA), en el orden pedido. */
export async function getBreedsByRids(rids: number[]): Promise<(BreedRow & { rid: number })[]> {
  if (!rids.length) return [];
  const rows = await catalog().getAllAsync<BreedRow & { rid: number }>(
    `SELECT b.rid, ${BREED_COLUMNS} FROM breed b WHERE b.rid IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(rids)],
  );
  const byRid = new Map(rows.map((r) => [r.rid, r]));
  return rids.map((r) => byRid.get(r)).filter((r): r is BreedRow & { rid: number } => !!r);
}

export async function getBreed(id: string): Promise<Breed | null> {
  return catalog().getFirstAsync<Breed>('SELECT * FROM breed WHERE id = ?', [id]);
}

/** Razas de cualquier especie que coinciden con la búsqueda del Bestiario. */
export async function searchBreeds(q: string, limit: number): Promise<(BreedRow & { species_name: string | null })[]> {
  const { where, params } = breedWhere(null, { q });
  if (!where) return [];
  return catalog().getAllAsync(
    `SELECT ${BREED_COLUMNS}, COALESCE(s.name_es, s.sci) AS species_name
     FROM breed b JOIN species s ON s.id = b.species_id ${where} ORDER BY b.seq LIMIT ?`,
    [...params, limit],
  );
}

export type City = { id: number; name: string; cc: string };

/** Ciudades (de la etapa urban) por id, en el orden pedido. */
export async function getCities(ids: number[]): Promise<City[]> {
  if (!ids.length) return [];
  const rows = await catalog().getAllAsync<City>(
    'SELECT id, name, cc FROM city WHERE id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(ids)],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((i) => byId.get(i)).filter((c): c is City => !!c);
}

export type SizeInfo = {
  mass_g: number | null;
  length_mm: number | null;
  /** Qué longitud es: «longitud total», «del hocico a la cloaca»… (de provenance). */
  length_kind: string | null;
};

const LENGTH_KIND: Record<string, string> = {
  TL: 'longitud total',
  SVL: 'del hocico a la cloaca',
  SCL: 'del caparazón',
};

/**
 * Tamaño verificado (etapa `size` de tools/): masa y longitud vienen en el
 * índice; qué longitud es (total, hocico-cloaca…), en la procedencia del trozo.
 * Sin dato fiable, null: la ficha no muestra el bloque (nunca se inventa un tamaño).
 */
export async function getSize(id: number): Promise<SizeInfo | null> {
  const row = await catalog().getFirstAsync<{ mass_g: number | null; length_mm: number | null }>(
    'SELECT mass_g, length_mm FROM species WHERE id = ?',
    [id],
  );
  if (!row || (row.mass_g == null && row.length_mm == null)) return null;
  let kind: string | null = null;
  if (row.length_mm != null) {
    const note = (await getProvenance(id)).find((p) => p.field === 'length_mm')?.note;
    const code = note?.split(':')[0]?.trim();
    kind = (code && LENGTH_KIND[code]) || null;
  }
  return { mass_g: row.mass_g, length_mm: row.length_mm, length_kind: kind };
}
