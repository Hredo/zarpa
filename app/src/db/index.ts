import { Directory } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { CATALOG_ASSET, CATALOG_BUILT_AT, CATALOG_SCHEMA, CATALOG_SPECIES, CATALOG_VERSION } from './catalogAsset';
import { pickCatalog, type CatalogInfo } from './catalogCloud';
import { forgetDownloadedCatalog, readDownloadedCatalog, setInstalledCatalog } from './catalogUpdate';
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
 *     Si Cloud Storage tiene uno más nuevo (`catalogUpdate.ts`), se baja y se
 *     abre ese en el siguiente arranque; el de la app queda de respaldo.
 *   - **Cuaderno** (`cuaderno.db`): lo que hace el usuario (avistamientos,
 *     pegatinas, especies guardadas). Nunca se sobrescribe; evoluciona con
 *     migraciones numeradas (`PRAGMA user_version`).
 */

let catalogDb: SQLite.SQLiteDatabase | null = null;
let journalDb: SQLite.SQLiteDatabase | null = null;

const CATALOG_PREFIX = 'catalogo-';

const BUNDLED: CatalogInfo = {
  version: CATALOG_VERSION,
  schema: CATALOG_SCHEMA,
  built_at: CATALOG_BUILT_AT,
  species: CATALOG_SPECIES,
  source: 'app',
};

let current: CatalogInfo = BUNDLED;

/** Catálogo abierto: versión, fecha, nº de especies y si es el de la app o uno bajado. */
export function catalogInfo(): CatalogInfo {
  return current;
}

async function openBundled(): Promise<SQLite.SQLiteDatabase> {
  const name = `${CATALOG_PREFIX}${CATALOG_VERSION}.db`;
  await SQLite.importDatabaseFromAssetAsync(name, { assetId: CATALOG_ASSET });
  const db = await SQLite.openDatabaseAsync(name);
  current = BUNDLED;
  await removeStaleCatalogs(name);
  return db;
}

export async function openDatabases(): Promise<void> {
  if (catalogDb && journalDb) return;

  const downloaded = pickCatalog(BUNDLED, readDownloadedCatalog(), CATALOG_SCHEMA);
  if (downloaded) {
    try {
      const db = await SQLite.openDatabaseAsync(downloaded.file);
      // Una consulta de verdad: un fichero dañado no debe dejar la app sin catálogo.
      await db.getFirstAsync('SELECT id FROM species LIMIT 1');
      catalogDb = db;
      current = downloaded;
      await removeStaleCatalogs(downloaded.file);
    } catch {
      forgetDownloadedCatalog();
      catalogDb = await openBundled();
    }
  } else {
    catalogDb = await openBundled();
  }
  setInstalledCatalog(current);

  journalDb = await SQLite.openDatabaseAsync('cuaderno.db');
  await migrateJournal(journalDb);
}

/** Borra catálogos de versiones anteriores; ocupan decenas de MB cada uno. */
async function removeStaleCatalogs(keep: string): Promise<void> {
  try {
    const dir = new Directory(SQLite.defaultDatabaseDirectory);
    for (const entry of dir.list()) {
      const file = entry.name;
      // Se borran también las descargas a medias (`.part`) y el catálogo de la app
      // cuando se usa uno bajado (vuelve a importarse si hiciera falta).
      if (file.startsWith(CATALOG_PREFIX) && file !== keep && file !== 'catalogo-activo.json' && !file.endsWith('-journal') && !file.endsWith('-wal') && !file.endsWith('-shm')) {
        if (file.endsWith('.part')) entry.delete();
        else await SQLite.deleteDatabaseAsync(file).catch(() => {});
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
