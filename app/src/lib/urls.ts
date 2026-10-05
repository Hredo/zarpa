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

/**
 * `t:<a>/<ab>/<fichero>`: miniatura de 960 px de Commons, que repetía el nombre
 * del fichero dos veces (tools/ … hosting.py, `compact`).
 */
function commonsThumb(rest: string): string {
  const name = rest.slice(rest.lastIndexOf('/') + 1);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${rest}/960px-${name}`;
}

export function expandUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const code = url.slice(0, 2);
  if (code === 't:') return commonsThumb(url.slice(2));
  const base = PREFIXES[code];
  return base ? base + url.slice(2) : url;
}
