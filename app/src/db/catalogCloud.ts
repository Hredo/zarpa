/*
 * Piezas puras de la actualización del catálogo desde Cloud Storage (sin
 * módulos nativos, para poder probarlas). El orquestador está en
 * `catalogUpdate.ts`; el manifiesto lo escribe `tools/ … stages/cloud.py`.
 */

export type CatalogManifest = {
  version: string;
  /** Esquema del catálogo: la app solo acepta el suyo. */
  schema: number;
  /** ISO UTC de la construcción; decide cuál es más nuevo. */
  built_at: string;
  species: number;
  breeds?: number | null;
  /** Bytes del .db sin comprimir. */
  size: number;
  /** MD5 del .db sin comprimir. */
  md5: string;
  files: {
    /** Comprimido, servido con `Content-Encoding: gzip`. */
    gz: { path: string; size: number };
    /** Sin comprimir, de respaldo. */
    raw: { path: string; size: number };
  };
  published_at?: string;
};

/** Catálogo instalado: el que viene con la app o uno bajado de la nube. */
export type CatalogInfo = {
  version: string;
  schema: number;
  built_at: string;
  species: number;
  source: 'app' | 'nube';
};

/** Comprueba que lo descargado es un manifiesto con todo lo que hace falta. */
export function parseManifest(json: unknown): CatalogManifest | null {
  if (!json || typeof json !== 'object') return null;
  const m = json as Record<string, unknown>;
  const files = m.files as Record<string, { path?: unknown; size?: unknown }> | undefined;
  const ok =
    typeof m.version === 'string' &&
    /^[a-f0-9]{6,64}$/.test(m.version) &&
    typeof m.schema === 'number' &&
    typeof m.built_at === 'string' &&
    typeof m.species === 'number' &&
    typeof m.size === 'number' &&
    m.size > 0 &&
    typeof m.md5 === 'string' &&
    /^[a-f0-9]{32}$/.test(m.md5) &&
    !!files &&
    typeof files.gz?.path === 'string' &&
    typeof files.raw?.path === 'string' &&
    (files.gz.path as string).startsWith('catalog/') &&
    (files.raw.path as string).startsWith('catalog/');
  return ok ? (json as CatalogManifest) : null;
}

/**
 * ¿Merece la pena bajar este catálogo? Solo si es del mismo esquema que la app
 * (uno de otro esquema podría no tener las columnas que la app consulta) y
 * más nuevo que el instalado.
 */
export function isNewerCatalog(m: CatalogManifest, current: Pick<CatalogInfo, 'version' | 'built_at'>, appSchema: number): boolean {
  return m.schema === appSchema && m.version !== current.version && m.built_at > current.built_at;
}

/**
 * Elige el catálogo con el que abrir la app: el bajado si es válido para este
 * esquema y más nuevo que el que trae la app; si no, el de la app (una versión
 * nueva de la app puede traer un catálogo más reciente que el bajado).
 */
export function pickCatalog(bundled: CatalogInfo, downloaded: (CatalogInfo & { file: string }) | null, appSchema: number) {
  if (downloaded && downloaded.schema === appSchema && downloaded.built_at > bundled.built_at) return downloaded;
  return null;
}

/** URL pública de un objeto de Storage (las reglas dejan leer `catalog/` sin cuenta). */
export function storageUrl(bucket: string, path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

/** «46,2 MB» */
export function fmtMegabytes(bytes: number): string {
  return `${(bytes / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}
