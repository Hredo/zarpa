import { catalog, journal } from './index';
import {
  buildCountQuery,
  buildListQuery,
  LIST_COLUMNS,
  type Context,
  type Filters,
  type SortKey,
  type SpeciesRow,
} from './query';

export type { SpeciesRow } from './query';

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
  const { sql, params } = buildListQuery(f, ctx, sort, limit, offset);
  return catalog().getAllAsync<SpeciesRow>(sql, params);
}

export async function countSpecies(f: Filters, ctx: Context): Promise<number> {
  const { sql, params } = buildCountQuery(f, ctx);
  const row = await catalog().getFirstAsync<{ n: number }>(sql, params);
  return row?.n ?? 0;
}

export async function getSpecies(id: number): Promise<SpeciesDetail | null> {
  return catalog().getFirstAsync<SpeciesDetail>(
    `SELECT s.*, d.summary, d.summary_lang, d.summary_src, d.aliases_es
     FROM species s LEFT JOIN detail d ON d.id = s.id WHERE s.id = ?`,
    [id],
  );
}

export async function getSpeciesByIds(ids: number[]): Promise<SpeciesRow[]> {
  if (ids.length === 0) return [];
  return catalog().getAllAsync<SpeciesRow>(
    `SELECT ${LIST_COLUMNS} FROM species s WHERE s.id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(ids)],
  );
}

export async function getImages(id: number): Promise<SpeciesImage[]> {
  return catalog().getAllAsync<SpeciesImage>('SELECT * FROM image WHERE id = ? ORDER BY rank', [id]);
}

export async function getProvenance(id: number): Promise<Provenance[]> {
  return catalog().getAllAsync<Provenance>('SELECT field, sources, note FROM provenance WHERE id = ?', [id]);
}

export async function getSources(): Promise<Source[]> {
  return catalog().getAllAsync<Source>('SELECT * FROM source');
}

export async function getCountries(id: number): Promise<CountryPresence[]> {
  return catalog().getAllAsync<CountryPresence>(
    'SELECT cc, obs, means FROM country WHERE id = ? ORDER BY obs DESC',
    [id],
  );
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
  return catalog().getAllAsync(
    `SELECT ${LIST_COLUMNS}, c.obs AS local_obs FROM country c JOIN species s ON s.id = c.id
     WHERE c.cc = ? ORDER BY c.obs DESC LIMIT ?`,
    [cc, limit],
  );
}

export type AtlasSpecies = { id: number; sci: string; name_es: string | null; name_en: string | null; gbif: number | null; img: string | null; grp: string };

/** Lo que necesita el Atlas de cada especie guardada (su clave de GBIF pinta la capa). */
export async function getAtlasSpecies(ids: number[]): Promise<AtlasSpecies[]> {
  if (ids.length === 0) return [];
  return catalog().getAllAsync<AtlasSpecies>(
    'SELECT id, sci, name_es, name_en, gbif, img, grp FROM species WHERE id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(ids)],
  );
}
