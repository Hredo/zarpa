import type { GroupCode } from '@/lib/groups';

/*
 * Construcción de las consultas del Bestiario.
 *
 * Es una función pura (filtros → SQL + parámetros) para poder probarla contra
 * el catálogo real sin dispositivo: `tests/` la ejecuta sobre la base que
 * genera `tools/` con el SQLite de Node.
 */

export type CaughtFilter = 'any' | 'caught' | 'missing';
export type DomesticFilter = 'any' | 'domestic' | 'wild';
export type SortKey = 'album' | 'popular' | 'name' | 'rarity';

export type Filters = {
  q: string;
  groups: GroupCode[];
  rarity: number[];
  iucn: string[];
  /** Máscara de medios (terrestre, agua dulce, marino, salobre): basta uno. */
  media: number;
  diets: string[];
  repro: string[];
  domestic: DomesticFilter;
  /** Máscara de ambientes (ciudad, bosque, selva…): basta uno. */
  envs: number;
  countries: string[];
  caught: CaughtFilter;
  saved: boolean;
};

export const EMPTY_FILTERS: Filters = {
  q: '',
  groups: [],
  rarity: [],
  iucn: [],
  media: 0,
  diets: [],
  repro: [],
  domestic: 'any',
  envs: 0,
  countries: [],
  caught: 'any',
  saved: false,
};

/**
 * Observaciones mínimas en un país para que la especie cuente como «se puede
 * ver allí». Con 1 entrarían los divagantes: el ave que un temporal dejó una vez
 * en Galicia no es un animal que vayas a encontrar en España.
 */
export const COUNTRY_MIN_OBS = 3;

export type SpeciesRow = {
  id: number;
  sci: string;
  name_es: string | null;
  grp: GroupCode;
  rarity: number;
  iucn: string | null;
  img: string | null;
  img_ratio: number | null;
  seq: number;
  rg_obs: number;
  family_sci: string | null;
  /** Nombre español verificado de la familia («Hormigas»), si lo hay (iNaturalist o Wikidata). */
  family_es?: string | null;
};

export const LIST_COLUMNS =
  's.id, s.sci, s.name_es, s.grp, s.rarity, s.iucn, s.img, s.img_ratio, s.seq, s.rg_obs, s.family_sci, s.family_es';

/** Convierte el texto del buscador en una consulta FTS5 segura por prefijos. */
export function ftsQuery(text: string): string | null {
  const tokens = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(' AND ');
}

export type Context = {
  caughtIds: number[];
  savedIds: number[];
};

export function buildWhere(f: Filters, ctx: Context): { where: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  const fts = ftsQuery(f.q);
  if (fts) {
    clauses.push('s.id IN (SELECT rowid FROM species_fts WHERE species_fts MATCH ?)');
    params.push(fts);
  }
  if (f.groups.length) {
    clauses.push(`s.grp IN (${f.groups.map(() => '?').join(',')})`);
    params.push(...f.groups);
  }
  if (f.rarity.length) {
    clauses.push(`s.rarity IN (${f.rarity.map(() => '?').join(',')})`);
    params.push(...f.rarity);
  }
  if (f.iucn.length) {
    clauses.push(`s.iucn IN (${f.iucn.map(() => '?').join(',')})`);
    params.push(...f.iucn);
  }
  if (f.media) {
    clauses.push('(s.medium & ?) != 0');
    params.push(f.media);
  }
  if (f.diets.length) {
    clauses.push(`s.diet IN (${f.diets.map(() => '?').join(',')})`);
    params.push(...f.diets);
  }
  if (f.repro.length) {
    clauses.push(`s.repro IN (${f.repro.map(() => '?').join(',')})`);
    params.push(...f.repro);
  }
  // 2 = animal doméstico; 1 = especie silvestre con forma doméstica (jabalí y
  // cerdo): cuenta en los dos filtros, porque es las dos cosas.
  if (f.domestic === 'domestic') clauses.push('s.domestic >= 1');
  if (f.domestic === 'wild') clauses.push('s.domestic <= 1');
  if (f.envs) {
    clauses.push('(s.envs & ?) != 0');
    params.push(f.envs);
  }
  if (f.countries.length) {
    clauses.push(
      `EXISTS (SELECT 1 FROM country c WHERE c.id = s.id AND c.obs >= ? AND c.cc IN (${f.countries
        .map(() => '?')
        .join(',')}))`,
    );
    params.push(COUNTRY_MIN_OBS, ...f.countries);
  }
  if (f.caught !== 'any') {
    clauses.push(`s.id ${f.caught === 'caught' ? '' : 'NOT '}IN (SELECT value FROM json_each(?))`);
    params.push(JSON.stringify(ctx.caughtIds));
  }
  if (f.saved) {
    clauses.push('s.id IN (SELECT value FROM json_each(?))');
    params.push(JSON.stringify(ctx.savedIds));
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const ORDER: Record<SortKey, string> = {
  album: 'ORDER BY g.position, s.seq',
  popular: 'ORDER BY s.rg_obs DESC',
  // Sin nombre en español, el científico ocupa su lugar alfabético.
  name: 'ORDER BY COALESCE(s.name_es, s.sci) COLLATE NOCASE',
  rarity: 'ORDER BY s.rarity DESC, s.rg_obs ASC',
};

export function buildListQuery(
  f: Filters,
  ctx: Context,
  sort: SortKey,
  limit: number,
  offset: number,
): { sql: string; params: (string | number)[] } {
  const { where, params } = buildWhere(f, ctx);
  // La vista trae el nombre de la familia; el recuento no lo necesita y va a la tabla.
  const sql = `SELECT ${LIST_COLUMNS} FROM species_v s JOIN grp g ON g.code = s.grp ${where} ${ORDER[sort]} LIMIT ? OFFSET ?`;
  return { sql, params: [...params, limit, offset] };
}

export function buildCountQuery(f: Filters, ctx: Context): { sql: string; params: (string | number)[] } {
  const { where, params } = buildWhere(f, ctx);
  return { sql: `SELECT COUNT(*) AS n FROM species s ${where}`, params };
}

export function activeFilterCount(f: Filters): number {
  return (
    (f.groups.length ? 1 : 0) +
    (f.rarity.length ? 1 : 0) +
    (f.iucn.length ? 1 : 0) +
    (f.media ? 1 : 0) +
    (f.diets.length ? 1 : 0) +
    (f.repro.length ? 1 : 0) +
    (f.domestic !== 'any' ? 1 : 0) +
    (f.envs ? 1 : 0) +
    (f.countries.length ? 1 : 0) +
    (f.caught !== 'any' ? 1 : 0) +
    (f.saved ? 1 : 0)
  );
}

/* --- Razas ------------------------------------------------------------------ */

export type Authority = 'fci' | 'fife' | 'fao' | 'mapa';

export const BREED_COLUMNS =
  'b.id, b.species_id, b.authority, b.code, b.name, b.grp, b.status, b.adapt, b.risk, b.origin_cc, b.origin_text, b.countries, b.img';

export type BreedQuery = { q?: string; cc?: string | null; authority?: Authority | null };

export function breedWhere(speciesId: number | null, query: BreedQuery): { where: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (speciesId !== null) {
    clauses.push('b.species_id = ?');
    params.push(speciesId);
  }
  const fts = ftsQuery(query.q ?? '');
  if (fts) {
    clauses.push('b.rid IN (SELECT rowid FROM breed_fts WHERE breed_fts MATCH ?)');
    params.push(fts);
  }
  if (query.authority) {
    clauses.push('b.authority = ?');
    params.push(query.authority);
  }
  if (query.cc) {
    // País de origen (FCI, MAPA) o con población registrada (FAO).
    clauses.push("(',' || COALESCE(b.origin_cc, '') || ',' || COALESCE(b.countries, '') || ',') LIKE ?");
    params.push(`%,${query.cc},%`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}
