import * as SQLite from 'expo-sqlite';

import type { CatalogInfo } from './catalogRemote';
import { dbDir, forgetActiveCatalog, INDEX_PREFIX, installLatestCatalog, readActiveCatalog, setInstalledCatalog, type ActiveCatalog } from './catalogUpdate';
import { migrateJournal } from './journal';

export { CatalogOffline } from './catalogUpdate';

/*
 * Dos bases de datos con vidas distintas:
 *
 *   - **Catálogo**: vive en Firebase Hosting (lo publica `tools/ … hosting.py`).
 *     En el móvil solo hay un índice ligero (`indice-<versión>.db`, ~45 MB) para
 *     buscar, filtrar y ordenar sin red; se baja la primera vez que se abre la
 *     app. Las fichas completas y las listas por país se piden al usarlas y se
 *     guardan en el propio índice (`catalogDetail.ts`). Si hay un índice más
 *     nuevo, se baja y se usa en el siguiente arranque (`catalogUpdate.ts`).
 *   - **Cuaderno** (`cuaderno.db`): lo que hace el usuario (avistamientos,
 *     pegatinas, especies guardadas). Nunca se sobrescribe; evoluciona con
 *     migraciones numeradas (`PRAGMA user_version`).
 */

let catalogDb: SQLite.SQLiteDatabase | null = null;
let journalDb: SQLite.SQLiteDatabase | null = null;
let current: ActiveCatalog | null = null;

/** Prefijo del catálogo completo que llevaban dentro las versiones anteriores de la app. */
const OLD_PREFIX = 'catalogo-';

export type BootProgress = { phase: 'downloading' | 'verifying'; progress: number; total: number };

/** Índice abierto: versión, fecha, nº de especies y trozos de las fichas. */
export function catalogInfo(): CatalogInfo {
  if (!current) throw new Error('El catálogo aún no está abierto');
  return current;
}

async function openIndex(info: ActiveCatalog): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(info.file);
  // Una consulta de verdad: un fichero dañado no debe dejar la app sin catálogo.
  await db.getFirstAsync('SELECT id FROM species LIMIT 1');
  return db;
}

/**
 * Abre el cuaderno y el catálogo. Si el móvil aún no tiene índice (primer
 * arranque, o uno dañado), lo baja de Hosting informando del progreso; sin red
 * lanza `CatalogOffline` y el arranque ofrece reintentar.
 */
export async function openDatabases(onProgress?: (p: BootProgress) => void): Promise<void> {
  if (!journalDb) {
    journalDb = await SQLite.openDatabaseAsync('cuaderno.db');
    await migrateJournal(journalDb);
  }
  if (catalogDb) return;

  let info = readActiveCatalog();
  let db: SQLite.SQLiteDatabase | null = null;
  if (info) {
    try {
      db = await openIndex(info);
    } catch {
      forgetActiveCatalog();
      info = null;
    }
  }
  if (!info || !db) {
    info = await installLatestCatalog((progress, phase, total) => onProgress?.({ phase, progress, total }));
    db = await openIndex(info);
  }
  catalogDb = db;
  current = info;
  setInstalledCatalog(info);
  removeStaleCatalogs(info.file);
}

/**
 * Borra índices de versiones anteriores y el catálogo completo que traían las
 * versiones viejas de la app (166 MB). Cada uno ocupa decenas de MB.
 */
function removeStaleCatalogs(keep: string): void {
  try {
    for (const entry of dbDir().list()) {
      const file = entry.name;
      const ours = file.startsWith(INDEX_PREFIX) || (file.startsWith(OLD_PREFIX) && file !== 'catalogo-activo.json');
      if (!ours || file === keep || file.startsWith(`${keep}-`)) continue;
      // Ficheros de la base (con sus -wal/-shm/-journal) y descargas a medias.
      if (file.endsWith('.part') || file.endsWith('-wal') || file.endsWith('-shm') || file.endsWith('-journal')) entry.delete();
      else void SQLite.deleteDatabaseAsync(file).catch(() => entry.delete());
    }
  } catch {
    // Limpiar es una mejora, no una condición para arrancar.
  }
}

export function catalog(): SQLite.SQLiteDatabase {
  if (!catalogDb) throw new Error('El catálogo aún no está abierto');
  return catalogDb;
}

export function journal(): SQLite.SQLiteDatabase {
  if (!journalDb) throw new Error('El cuaderno aún no está abierto');
  return journalDb;
}

/** ¿Está abierto el catálogo? (las tareas en segundo plano pueden arrancar sin red). */
export function catalogReady(): boolean {
  return catalogDb !== null;
}
