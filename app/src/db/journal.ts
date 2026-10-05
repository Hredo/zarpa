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
  // 3 · diario de campo (aditiva: solo añade columnas y rellena `updated_at`).
  //   note             → ya existía: notas de texto del usuario.
  //   voice_note       → nota de voz: ruta RELATIVA al directorio de documentos
  //                      (`notas-voz/<id>-<ms>.m4a`); la absoluta cambia entre
  //                      actualizaciones de iOS.
  //   voice_ms         → duración de la nota de voz en milisegundos.
  //   weather_*        → clima de Open-Meteo al fichar: código WMO, temperatura y
  //                      sensación (°C), humedad (%), viento (km/h), is_day (0/1)
  //                      y weather_at (ISO UTC de la medida). NULL = sin datos.
  //   day_phase        → amanecer·manana·mediodia·tarde·atardecer·noche (hora local
  //                      del móvil al fichar). NULL en avistamientos antiguos.
  //   updated_at       → última edición (ISO UTC); la sincronización la usa.
  `
  ALTER TABLE sighting ADD COLUMN voice_note TEXT;
  ALTER TABLE sighting ADD COLUMN voice_ms INTEGER;
  ALTER TABLE sighting ADD COLUMN weather_code INTEGER;
  ALTER TABLE sighting ADD COLUMN weather_temp REAL;
  ALTER TABLE sighting ADD COLUMN weather_feels REAL;
  ALTER TABLE sighting ADD COLUMN weather_humidity INTEGER;
  ALTER TABLE sighting ADD COLUMN weather_wind REAL;
  ALTER TABLE sighting ADD COLUMN weather_is_day INTEGER;
  ALTER TABLE sighting ADD COLUMN weather_at TEXT;
  ALTER TABLE sighting ADD COLUMN day_phase TEXT;
  ALTER TABLE sighting ADD COLUMN updated_at TEXT;
  UPDATE sighting SET updated_at = created_at WHERE updated_at IS NULL;
  `,
  // 4 · modo excursión: una salida y los objetivos que se marcaron al empezarla.
  `
  CREATE TABLE excursion (
    id TEXT PRIMARY KEY NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    lat REAL,
    lng REAL,
    place TEXT,
    month INTEGER NOT NULL,
    phase TEXT NOT NULL
  );
  CREATE TABLE excursion_target (
    excursion_id TEXT NOT NULL REFERENCES excursion (id) ON DELETE CASCADE,
    species_id INTEGER NOT NULL,
    prob REAL NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0 CHECK (seen IN (0, 1)),
    seen_at TEXT,
    sighting_id TEXT,
    PRIMARY KEY (excursion_id, species_id)
  ) WITHOUT ROWID;
  CREATE INDEX excursion_started ON excursion (started_at DESC);
  `,
];

export const JOURNAL_VERSION = MIGRATIONS.length;

/**
 * Lleva el cuaderno a la última versión (o a `upTo`, para las pruebas). Es
 * idempotente: una base ya actualizada no hace nada, y una vieja recorre solo
 * las migraciones que le faltan sin perder datos.
 */
export async function migrateJournal(db: SQLiteDatabase, upTo: number = MIGRATIONS.length): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < Math.min(upTo, MIGRATIONS.length)) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
