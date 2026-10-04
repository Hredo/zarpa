/*
 * El catálogo guarda las URLs de fotos con un prefijo corto (build.py,
 * URL_PREFIXES): se repiten cientos de miles de veces. Aquí se reconstruyen.
 */
const PREFIXES: Record<string, string> = {
  'c:': 'https://upload.wikimedia.org/wikipedia/commons/',
  'f:': 'https://commons.wikimedia.org/wiki/File:',
  'i:': 'https://inaturalist-open-data.s3.amazonaws.com/photos/',
  's:': 'https://static.inaturalist.org/photos/',
  'p:': 'https://www.inaturalist.org/photos/',
};

export function expandUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = PREFIXES[url.slice(0, 2)];
  return base ? base + url.slice(2) : url;
}
