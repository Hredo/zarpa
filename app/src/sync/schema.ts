/*
 * Mapeo entre la fila local `sighting` y el documento de Firestore.
 *
 * Es GENÉRICO a propósito: otro agente añade columnas al cuaderno (notas,
 * clima, audio) y no debe hacer falta tocar esto. Cada columna de la fila
 * viaja tal cual (mismo nombre, mismo valor) salvo las que son rutas de
 * ficheros locales, que no significan nada en otro móvil.
 *
 * Para ampliar el mapeo:
 *   - columna que apunta a un fichero local  → añádela a LOCAL_FILE_COLUMNS.
 *   - columna que debe renombrarse o transformarse → usa RENAME / TRANSFORMS.
 * Y si el valor tiene un tope de tamaño nuevo, recuerda firestore.rules.
 */

/** Columnas locales que son rutas a ficheros: no se suben como dato. */
export const LOCAL_FILE_COLUMNS: readonly string[] = ['photo', 'sticker', 'voice_note', 'audio'];

/** Campos que solo existen en la nube. */
export const CLOUD_ONLY_FIELDS: readonly string[] = ['has_photo', 'has_sticker', 'has_voice', 'sticker_ext', 'voice_ext', 'synced_at', 'schema'];

/** Versión del mapeo; sube si cambia el significado de algún campo. */
export const SYNC_SCHEMA = 3;

/** Qué ficheros de un avistamiento están en Storage. */
export type CloudFiles = { photo: boolean; sticker: boolean; voice: boolean };

/** Extensión en minúsculas de una ruta o URI (`file:///a/b.PNG` → `png`), o null. */
export function fileExt(uri: unknown): string | null {
  if (typeof uri !== 'string') return null;
  const m = /\.([a-z0-9]{2,4})(?:[?#].*)?$/i.exec(uri);
  return m ? m[1].toLowerCase() : null;
}

/** Pegatinas: PNG recortado o, si no hubo recorte, el JPEG del encuadre. */
export const STICKER_EXTS = ['png', 'jpg'] as const;
/** Notas de voz: lo que graba expo-audio en cada sistema. */
export const VOICE_EXTS = ['m4a', 'aac', 'mp4', 'caf', '3gp'] as const;

/** Rutas en Storage de los ficheros de un avistamiento (las mismas que storage.rules). */
export const storagePath = {
  photo: (uid: string, id: string) => `users/${uid}/sightings/${id}.jpg`,
  sticker: (uid: string, id: string, ext: string) => `users/${uid}/sightings/${id}.sticker.${ext}`,
  voice: (uid: string, id: string, ext: string) => `users/${uid}/sightings/${id}.voice.${ext}`,
};

export function stickerExtOf(uri: unknown): (typeof STICKER_EXTS)[number] {
  return fileExt(uri) === 'png' ? 'png' : 'jpg';
}

export function voiceExtOf(rel: unknown): (typeof VOICE_EXTS)[number] {
  const e = fileExt(rel);
  return (VOICE_EXTS as readonly string[]).includes(e ?? '') ? (e as (typeof VOICE_EXTS)[number]) : 'm4a';
}

/**
 * La nota de voz guardada en `sync_item.voice_path`: la ruta local que está en
 * la nube, o `!ruta` si el fichero ya no estaba en el móvil al subir (se anota
 * para no reintentarlo en cada pasada, pero no cuenta como subido).
 */
export function voiceUploaded(path: string | null | undefined): boolean {
  return !!path && !path.startsWith('!');
}

export function voiceKey(path: string | null | undefined): string | null {
  return path ? path.replace(/^!/, '') : null;
}

export type LocalRow = Record<string, unknown>;

/** Valores que Firestore acepta; el resto (undefined, funciones) se descarta. */
function clean(v: unknown): string | number | boolean | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  return String(v);
}

/** Documento de nube a partir de la fila local (sin `synced_at`, que pone el servidor). */
export function toRemote(row: LocalRow, files: boolean | Partial<CloudFiles>): Record<string, string | number | boolean | null> {
  const f: Partial<CloudFiles> = typeof files === 'boolean' ? { photo: files } : files;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' || LOCAL_FILE_COLUMNS.includes(k) || CLOUD_ONLY_FIELDS.includes(k)) continue;
    out[k] = clean(v);
  }
  out.has_photo = f.photo === true;
  out.has_sticker = f.sticker === true;
  out.has_voice = f.voice === true;
  out.sticker_ext = f.sticker === true ? stickerExtOf(row.sticker) : null;
  out.voice_ext = f.voice === true ? voiceExtOf(row.voice_note) : null;
  out.schema = SYNC_SCHEMA;
  return out;
}

/**
 * Valores locales a partir de un documento de la nube. Solo devuelve columnas
 * que EXISTEN en la tabla local (`localColumns`): si el otro móvil tiene una
 * versión más nueva del cuaderno, los campos que este no conoce se ignoran en
 * vez de romper el INSERT.
 */
export function fromRemote(data: Record<string, unknown>, localColumns: readonly string[]): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const col of localColumns) {
    if (col === 'id' || LOCAL_FILE_COLUMNS.includes(col)) continue;
    if (col in data) out[col] = clean(data[col]);
  }
  return out;
}

/** Hash FNV-1a (32 bits) de los campos sincronizados, en orden estable. */
export function rowHash(row: LocalRow): string {
  // Solo importan los datos: qué ficheros hay en la nube se sigue aparte.
  const doc = toRemote(row, false);
  const keys = Object.keys(doc).sort();
  let h = 0x811c9dc5;
  const s = keys.map((k) => `${k}=${JSON.stringify(doc[k])}`).join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export type ItemState = {
  id: string;
  hash: string | null;
  photo_ok: number;
  status: 'pending' | 'synced' | 'error';
  attempts: number;
  /** 1 = pegatina en Storage, 2 = no hay pegatina que subir. */
  sticker_ok?: number;
  /** Ruta local (relativa) de la nota de voz que está en Storage. */
  voice_path?: string | null;
};

/** Gana la edición más reciente (`updated_at`, ISO UTC). Empate: gana lo local. */
export function remoteIsNewer(localUpdatedAt: unknown, remoteUpdatedAt: unknown): boolean {
  if (typeof remoteUpdatedAt !== 'string' || !remoteUpdatedAt) return false;
  if (typeof localUpdatedAt !== 'string' || !localUpdatedAt) return true;
  return remoteUpdatedAt > localUpdatedAt;
}

export type Plan = {
  /** Filas locales que hay que subir (nuevas o cambiadas). */
  push: string[];
  /** Ids que ya se subieron y el usuario borró en local: borrar en la nube. */
  remove: string[];
};

/** Intentos tras los que un elemento rechazado se deja de reintentar hasta reabrir la app. */
export const MAX_ATTEMPTS = 5;

/**
 * Qué hay que hacer para que la nube refleje el cuaderno local. Puro: recibe
 * las filas locales (con su hash) y el estado guardado, y devuelve el plan.
 */
export function planSync(
  local: { id: string; hash: string; voice?: string | null }[],
  states: ItemState[],
  opts: { retryExhausted?: boolean } = {},
): Plan {
  const byId = new Map(states.map((s) => [s.id, s]));
  const localIds = new Set(local.map((l) => l.id));
  const push: string[] = [];
  for (const l of local) {
    const st = byId.get(l.id);
    // La nota de voz se grabó, se cambió o se quitó desde la última subida.
    const voiceChanged = l.voice !== undefined && (l.voice ?? null) !== voiceKey(st?.voice_path);
    if (!st) push.push(l.id);
    else if (st.status !== 'synced' || st.hash !== l.hash || st.photo_ok === 0 || st.sticker_ok === 0 || voiceChanged) {
      if (st.attempts >= MAX_ATTEMPTS && !opts.retryExhausted) continue;
      push.push(l.id);
    }
  }
  const remove = states.filter((s) => s.status === 'synced' && !localIds.has(s.id)).map((s) => s.id);
  return { push, remove };
}
