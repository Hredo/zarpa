import { Directory } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { CATALOG_ASSET, CATALOG_VERSION } from './catalogAsset';
import { migrateJournal } from './journal';

/*
 * Dos bases de datos con vidas distintas:
 *
 *   - **Catálogo** (`catalogo-<versión>.db`): la genera `tools/` desde las
 *     fuentes oficiales y viaja dentro de la app. Es de solo lectura. El nombre
 *     lleva la versión para que una actualización de la app traiga el catálogo
 *     nuevo sin tocar el del usuario: se importa el fichero nuevo y se borran
 *     los viejos. Si el nombre fuera fijo, `importDatabaseFromAssetAsync` vería
 *     que ya existe y seguiría usando el antiguo para siempre.
 *   - **Cuaderno** (`cuaderno.db`): lo que hace el usuario (avistamientos,
 *     pegatinas, especies guardadas). Nunca se sobrescribe; evoluciona con
 *     migraciones numeradas (`PRAGMA user_version`).
 */

let catalogDb: SQLite.SQLiteDatabase | null = null;
let journalDb: SQLite.SQLiteDatabase | null = null;

const CATALOG_PREFIX = 'catalogo-';

export async function openDatabases(): Promise<void> {
  if (catalogDb && journalDb) return;

  const name = `${CATALOG_PREFIX}${CATALOG_VERSION}.db`;
  await SQLite.importDatabaseFromAssetAsync(name, { assetId: CATALOG_ASSET });
  catalogDb = await SQLite.openDatabaseAsync(name);
  await removeStaleCatalogs(name);

  journalDb = await SQLite.openDatabaseAsync('cuaderno.db');
  await migrateJournal(journalDb);
}

/** Borra catálogos de versiones anteriores; ocupan decenas de MB cada uno. */
async function removeStaleCatalogs(current: string): Promise<void> {
  try {
    const dir = new Directory(SQLite.defaultDatabaseDirectory);
    for (const entry of dir.list()) {
      const file = entry.name;
      if (file.startsWith(CATALOG_PREFIX) && file !== current && !file.endsWith('-journal') && !file.endsWith('-wal')) {
        await SQLite.deleteDatabaseAsync(file).catch(() => {});
      }
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
