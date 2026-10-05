/*
 * Piezas puras del catálogo servido desde Firebase Hosting (sin módulos
 * nativos, para poder probarlas). Lo publica `tools/ … stages/hosting.py`:
 *
 *   c/manifest.json            versión vigente (sin caché)
 *   c/<versión>/indice.db.gz   índice ligero que se guarda en el móvil
 *   c/<versión>/d/<n>.json     fichas completas, en trozos (n = id % shards)
 *   c/<versión>/cc/<CC>.json   especies de cada país, de más a menos vista
 *
 * El índice se baja al abrir la app por primera vez (y cuando hay uno nuevo);
 * las fichas y los países, cuando se usan, y se guardan en el propio índice.
 */

/** Esquema del índice que entiende esta app (= INDEX_SCHEMA en hosting.py). */
export const CATALOG_SCHEMA = 4;

/** Sitio de Firebase Hosting con el catálogo (público, sin cuenta). */
export const CATALOG_URL = (process.env.EXPO_PUBLIC_CATALOG_URL || 'https://zarpa-47a67.web.app').replace(/\/+$/, '');

export type CatalogManifest = {
  version: string;
  schema: number;
  /** ISO UTC de la construcción del catálogo; decide cuál es más nuevo. */
  built_at: string;
  species: number;
  breeds?: number | null;
  /** En cuántos trozos están las fichas. */
  shards: number;
  /** Bytes del índice sin comprimir. */
  size: number;
  /** MD5 del índice sin comprimir. */
  md5: string;
  files: {
    /** Comprimido, servido con `Content-Encoding: gzip`: llega ya descomprimido. */
    gz: { path: string; size: number };
    /** Sin comprimir, de respaldo. */
    raw: { path: string; size: number };
  };
  published_at?: string;
};

/** Índice instalado en el móvil. */
export type CatalogInfo = {
  version: string;
  schema: number;
  built_at: string;
  species: number;
  shards: number;
  /** Bytes del índice en disco. */
  size: number;
};

/** Comprueba que lo descargado es un manifiesto con todo lo que hace falta. */
export function parseManifest(json: unknown): CatalogManifest | null {
  if (!json || typeof json !== 'object') return null;
  const m = json as Record<string, unknown>;
  const files = m.files as Record<string, { path?: unknown; size?: unknown }> | undefined;
  const version = typeof m.version === 'string' && /^[a-f0-9]{6,64}$/.test(m.version) ? m.version : null;
  const inVersion = (p: unknown) => typeof p === 'string' && !!version && p.startsWith(`c/${version}/`) && !p.includes('..');
  const ok =
    !!version &&
    typeof m.schema === 'number' &&
    typeof m.built_at === 'string' &&
    typeof m.species === 'number' &&
    typeof m.shards === 'number' &&
    Number.isInteger(m.shards) &&
    m.shards > 0 &&
    typeof m.size === 'number' &&
    m.size > 0 &&
    typeof m.md5 === 'string' &&
    /^[a-f0-9]{32}$/.test(m.md5) &&
    !!files &&
    inVersion(files.gz?.path) &&
    inVersion(files.raw?.path);
  return ok ? (json as CatalogManifest) : null;
}

/**
 * ¿Merece la pena bajar este catálogo? Solo si es del esquema de la app (otro
 * podría no tener las columnas que consulta) y distinto y más nuevo que el
 * instalado.
 */
export function isNewerCatalog(m: CatalogManifest, current: Pick<CatalogInfo, 'version' | 'built_at'>, appSchema: number): boolean {
  return m.schema === appSchema && m.version !== current.version && m.built_at >= current.built_at;
}

export function catalogUrl(path: string): string {
  return `${CATALOG_URL}/${path}`;
}

/** Trozo de las fichas en el que está una especie. */
export function shardOf(id: number, shards: number): number {
  return ((id % shards) + shards) % shards;
}

export const shardPath = (version: string, n: number) => `c/${version}/d/${n}.json`;
export const countryPath = (version: string, cc: string) => `c/${version}/cc/${cc.toUpperCase()}.json`;

/** Lo que trae cada especie en su trozo (lo que el índice no lleva). */
export type ShardEntry = {
  /** Columnas de la ficha: resumen, alias, estado regional, ciudades, enlaces… */
  d?: Record<string, string | number | null>;
  /** Galería: [rango, url, proporción, autor, licencia, fuente, página]. */
  i?: [number, string, number | null, string | null, string | null, 'commons' | 'inat', string | null][];
  /** De dónde sale cada dato: [campo, fuentes, nota]. */
  p?: [string, string, string | null][];
  /** Países: [código, observaciones, nativa | endémica | introducida]. */
  c?: [string, number, string | null][];
};

/** Valida un trozo bajado (versión y número) y devuelve sus especies. */
export function parseShard(json: unknown, version: string, n: number): Record<string, ShardEntry> | null {
  if (!json || typeof json !== 'object') return null;
  const s = json as { v?: unknown; n?: unknown; sp?: unknown };
  if (s.v !== version || s.n !== n || !s.sp || typeof s.sp !== 'object') return null;
  return s.sp as Record<string, ShardEntry>;
}

/** Valida la lista de un país: [[id, observaciones], …]. */
export function parseCountry(json: unknown, version: string, cc: string): [number, number][] | null {
  if (!json || typeof json !== 'object') return null;
  const c = json as { v?: unknown; cc?: unknown; s?: unknown };
  if (c.v !== version || c.cc !== cc.toUpperCase() || !Array.isArray(c.s)) return null;
  return (c.s as unknown[]).filter((r): r is [number, number] => Array.isArray(r) && typeof r[0] === 'number' && typeof r[1] === 'number');
}

/** «46,2 MB» */
export function fmtMegabytes(bytes: number): string {
  return `${(bytes / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}
