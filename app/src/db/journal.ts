import type { SQLiteDatabase } from 'expo-sqlite';

/*
 * Esquema del cuaderno del usuario.
 *
 * Cada entrada de MIGRATIONS lleva la base de la versión N-1 a la N. Nunca se
 * edita una migración publicada: se añade otra. `PRAGMA user_version` guarda la
 * última aplicada, así que una instalación vieja recorre todas las que le faltan.
 */
const MIGRATIONS: string[] = [
  // 1 · avistamientos, especies guardadas para el Atlas y vistas recientes.
  `
  CREATE TABLE sighting (
    id TEXT PRIMARY KEY NOT NULL,
    species_id INTEGER,
    breed_id TEXT,
    created_at TEXT NOT NULL,
    lat REAL,
    lng REAL,
    accuracy REAL,
    place TEXT,
    photo TEXT NOT NULL,
    sticker TEXT,
    method TEXT NOT NULL CHECK (method IN ('ia', 'manual')),
    confidence REAL,
    candidates TEXT,
    verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    model TEXT,
    note TEXT
  );
  CREATE INDEX sighting_species ON sighting (species_id);
  CREATE INDEX sighting_created ON sighting (created_at DESC);

  CREATE TABLE saved (
    species_id INTEGER PRIMARY KEY NOT NULL,
    saved_at TEXT NOT NULL,
    hue INTEGER NOT NULL
  );

  CREATE TABLE recent (
    species_id INTEGER PRIMARY KEY NOT NULL,
    viewed_at TEXT NOT NULL
  );
  `,
  // 2 · caché de respuestas de API (especies parecidas, estacionalidad, lugares).
  `
  CREATE TABLE cache (
    key TEXT PRIMARY KEY NOT NULL,
    json TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  `,
];

export const JOURNAL_VERSION = MIGRATIONS.length;

export async function migrateJournal(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
