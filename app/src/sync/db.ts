import type { SQLiteDatabase } from 'expo-sqlite';

import { journal } from '@/db';

import type { ItemState } from './schema';

/*
 * Estado de la sincronización, en tablas PROPIAS dentro de cuaderno.db.
 *
 * No pasan por las migraciones de `db/journal.ts` (otro agente le añade
 * columnas): este módulo las crea con IF NOT EXISTS la primera vez que se usa,
 * así que su ciclo de vida es independiente del esquema del cuaderno.
 *
 *   sync_item  una fila por (cuenta, avistamiento): hash de lo último subido,
 *              si la foto ya está en la nube, estado y nº de intentos. Es la
 *              cola de reintento: lo que no esté `synced` se vuelve a intentar.
 *   sync_meta  pares clave/valor por cuenta (última sincronización, marca de
 *              la última descarga).
 */

let ready: Promise<void> | null = null;

export function ensureSyncTables(db: SQLiteDatabase = journal()): Promise<void> {
  ready ??= db
    .execAsync(
      `CREATE TABLE IF NOT EXISTS sync_item (
         uid TEXT NOT NULL,
         id TEXT NOT NULL,
         hash TEXT,
         photo_ok INTEGER NOT NULL DEFAULT 0,
         status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'error')),
         attempts INTEGER NOT NULL DEFAULT 0,
         last_error TEXT,
         updated_at TEXT NOT NULL,
         sticker_ok INTEGER NOT NULL DEFAULT 0,
         voice_path TEXT,
         PRIMARY KEY (uid, id)
       );
       CREATE TABLE IF NOT EXISTS sync_meta (
         uid TEXT NOT NULL,
         key TEXT NOT NULL,
         value TEXT,
         PRIMARY KEY (uid, key)
       );`,
    )
    .then(async () => {
      // Instalaciones anteriores: la tabla existía sin las columnas de pegatina y voz.
      const cols = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(sync_item)')).map((c) => c.name);
      if (!cols.includes('sticker_ok')) await db.execAsync('ALTER TABLE sync_item ADD COLUMN sticker_ok INTEGER NOT NULL DEFAULT 0');
      if (!cols.includes('voice_path')) await db.execAsync('ALTER TABLE sync_item ADD COLUMN voice_path TEXT');
    })
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

export async function loadStates(uid: string): Promise<ItemState[]> {
  await ensureSyncTables();
  return journal().getAllAsync<ItemState>('SELECT id, hash, photo_ok, status, attempts, sticker_ok, voice_path FROM sync_item WHERE uid = ?', [uid]);
}

/** Estado de los ficheros de un avistamiento al terminar de subirlo o bajarlo. */
export type SyncedFiles = {
  /** 1 = foto en Storage, 2 = no hay foto que subir. */
  photo: 1 | 2;
  /** 1 = pegatina en Storage, 2 = no hay pegatina aparte de la foto. */
  sticker: 1 | 2;
  /** Ruta local de la nota de voz que está en la nube (ver `voiceUploaded`). */
  voice: string | null;
};

export async function markSynced(uid: string, id: string, hash: string, files: SyncedFiles): Promise<void> {
  await journal().runAsync(
    `INSERT INTO sync_item (uid, id, hash, photo_ok, sticker_ok, voice_path, status, attempts, last_error, updated_at)
     VALUES (?,?,?,?,?,?,'synced',0,NULL,?)
     ON CONFLICT (uid, id) DO UPDATE SET hash = excluded.hash, photo_ok = excluded.photo_ok, sticker_ok = excluded.sticker_ok,
       voice_path = excluded.voice_path, status = 'synced', attempts = 0, last_error = NULL, updated_at = excluded.updated_at`,
    [uid, id, hash, files.photo, files.sticker, files.voice, new Date().toISOString()],
  );
}

export async function markFailed(uid: string, id: string, message: string): Promise<void> {
  await journal().runAsync(
    `INSERT INTO sync_item (uid, id, status, attempts, last_error, updated_at)
     VALUES (?,?,'error',1,?,?)
     ON CONFLICT (uid, id) DO UPDATE SET status = 'error', attempts = attempts + 1, last_error = excluded.last_error,
       updated_at = excluded.updated_at`,
    [uid, id, message.slice(0, 300), new Date().toISOString()],
  );
}

export async function forget(uid: string, id: string): Promise<void> {
  await journal().runAsync('DELETE FROM sync_item WHERE uid = ? AND id = ?', [uid, id]);
}

/** Olvida todo lo de una cuenta (al borrarla). El cuaderno local no se toca. */
export async function clearAccountState(uid: string): Promise<void> {
  await ensureSyncTables();
  await journal().runAsync('DELETE FROM sync_item WHERE uid = ?', [uid]);
  await journal().runAsync('DELETE FROM sync_meta WHERE uid = ?', [uid]);
  if ((await getNotebookOwner()) === uid) await setNotebookOwner(null);
}

/*
 * Dueño del cuaderno de ESTE móvil: la cuenta cuya sincronización lo tocó por
 * última vez. Cerrar sesión no lo cambia (el cuaderno se queda), así que si
 * entra otra cuenta se detecta y se pregunta en vez de mezclar en silencio.
 * `null` = cuaderno sin dueño (nunca sincronizado o borrado al cerrar sesión).
 */
const DEVICE = '_dispositivo';

export async function getNotebookOwner(): Promise<string | null> {
  return getMeta(DEVICE, 'notebook_owner');
}

export async function setNotebookOwner(uid: string | null): Promise<void> {
  await ensureSyncTables();
  if (uid) await setMeta(DEVICE, 'notebook_owner', uid);
  else await journal().runAsync('DELETE FROM sync_meta WHERE uid = ? AND key = ?', [DEVICE, 'notebook_owner']);
}

/** La pegatina ya está en Storage (o no hay pegatina: 2). */
export async function markStickerOk(uid: string, id: string, value: 1 | 2): Promise<void> {
  await journal().runAsync(
    `INSERT INTO sync_item (uid, id, sticker_ok, status, updated_at) VALUES (?,?,?,'pending',?)
     ON CONFLICT (uid, id) DO UPDATE SET sticker_ok = excluded.sticker_ok, updated_at = excluded.updated_at`,
    [uid, id, value, new Date().toISOString()],
  );
}

/** La nota de voz con esa ruta local ya está en Storage (o no hay: null). */
export async function markVoicePath(uid: string, id: string, path: string | null): Promise<void> {
  await journal().runAsync(
    `INSERT INTO sync_item (uid, id, voice_path, status, updated_at) VALUES (?,?,?,'pending',?)
     ON CONFLICT (uid, id) DO UPDATE SET voice_path = excluded.voice_path, updated_at = excluded.updated_at`,
    [uid, id, path, new Date().toISOString()],
  );
}

export async function getMeta(uid: string, key: string): Promise<string | null> {
  await ensureSyncTables();
  const row = await journal().getFirstAsync<{ value: string | null }>('SELECT value FROM sync_meta WHERE uid = ? AND key = ?', [uid, key]);
  return row?.value ?? null;
}

export async function setMeta(uid: string, key: string, value: string): Promise<void> {
  await journal().runAsync('INSERT OR REPLACE INTO sync_meta (uid, key, value) VALUES (?,?,?)', [uid, key, value]);
}

/** Columnas actuales de la tabla `sighting` (el esquema crece con las migraciones). */
export async function sightingColumns(): Promise<string[]> {
  const rows = await journal().getAllAsync<{ name: string }>('PRAGMA table_info(sighting)');
  return rows.map((r) => r.name);
}

/** La foto ya está en Storage aunque el documento aún no se haya escrito. */
export async function markPhotoOk(uid: string, id: string): Promise<void> {
  await journal().runAsync(
    `INSERT INTO sync_item (uid, id, photo_ok, status, updated_at) VALUES (?,?,1,'pending',?)
     ON CONFLICT (uid, id) DO UPDATE SET photo_ok = 1, updated_at = excluded.updated_at`,
    [uid, id, new Date().toISOString()],
  );
}
