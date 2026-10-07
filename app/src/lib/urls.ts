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

/**
 * Identificación de la app ante las API y servidores de fotos. Wikimedia
 * responde 403 a la cabecera por defecto de Android («okhttp/…»): sin esto,
 * las fotos de Commons (la mitad del catálogo) y sus sonidos no cargan.
 */
export const USER_AGENT = 'Zarpa/0.1 (app de fauna; +https://github.com/Hredo/zarpa)';

const HEADERS = { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT };

/** Fuente de imagen o sonido remoto con la cabecera de la app; lo local y los recursos empaquetados pasan tal cual. */
export function withUserAgent<T>(src: T): T | { uri: string; headers: Record<string, string> } {
  if (typeof src === 'string') return /^https?:/i.test(src) ? { uri: src, headers: HEADERS } : src;
  if (src && typeof src === 'object' && !Array.isArray(src) && 'uri' in src) {
    const s = src as { uri?: string; headers?: Record<string, string> };
    if (s.uri && /^https?:/i.test(s.uri)) return { ...s, uri: s.uri, headers: { ...HEADERS, ...s.headers } };
  }
  return src;
}

export const NET_HEADERS = HEADERS;

/**
 * Ruta del sistema de ficheros a partir de una URI `file://` (o de una ruta).
 * Las bibliotecas nativas (ExecuTorch) abren la ruta tal cual: con `file:///…`
 * no encuentran el fichero («AccessFailed») y la IA no carga.
 */
export function fsPath(uriOrPath: string): string {
  if (!uriOrPath.startsWith('file://')) return uriOrPath;
  const rest = uriOrPath.slice('file://'.length);
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/** URI `file://` a partir de una ruta (o de una URI): la que necesita expo-file-system. */
export function fileUri(pathOrUri: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathOrUri)) return pathOrUri;
  return `file://${encodeURI(pathOrUri)}`;
}
