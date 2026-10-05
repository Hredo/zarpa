import Database from 'better-sqlite3';
import type { SQLiteDatabase } from 'expo-sqlite';

import { JOURNAL_VERSION, migrateJournal } from '@/db/journal';

/*
 * La migración del cuaderno contra una base real en memoria (better-sqlite3
 * con la interfaz mínima de expo-sqlite que usa `migrateJournal`).
 */
function adapt(db: Database.Database): SQLiteDatabase {
  const api = {
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    getFirstAsync: async (sql: string) => db.prepare(sql).get() ?? null,
    withExclusiveTransactionAsync: async (cb: (tx: unknown) => Promise<void>) => {
      db.exec('BEGIN');
      try {
        await cb(api);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return api as unknown as SQLiteDatabase;
}

const cols = (db: Database.Database, table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe('migración del cuaderno', () => {
  it('una base nueva llega a la última versión', async () => {
    const db = new Database(':memory:');
    await migrateJournal(adapt(db));
    expect(db.pragma('user_version', { simple: true })).toBe(JOURNAL_VERSION);
    expect(cols(db, 'sighting')).toEqual(expect.arrayContaining(['voice_note', 'voice_ms', 'weather_code', 'weather_temp', 'day_phase', 'updated_at']));
    expect(cols(db, 'excursion_target')).toContain('sighting_id');
  });

  it('una base de la versión 2 se actualiza sin perder avistamientos', async () => {
    const db = new Database(':memory:');
    await migrateJournal(adapt(db), 2);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    db.prepare(
      "INSERT INTO sighting (id, species_id, created_at, photo, method, note) VALUES ('a', 42, '2026-09-01T10:00:00.000Z', 'file:///a.jpg', 'ia', 'nota vieja')",
    ).run();

    await migrateJournal(adapt(db));
    const row = db.prepare("SELECT * FROM sighting WHERE id = 'a'").get() as Record<string, unknown>;
    expect(row.note).toBe('nota vieja');
    expect(row.species_id).toBe(42);
    expect(row.weather_code).toBeNull();
    expect(row.voice_note).toBeNull();
    expect(row.updated_at).toBe('2026-09-01T10:00:00.000Z');
  });

  it('es idempotente y las excursiones borran sus objetivos en cascada', async () => {
    const db = new Database(':memory:');
    await migrateJournal(adapt(db));
    await migrateJournal(adapt(db));
    db.pragma('foreign_keys = ON');
    db.prepare("INSERT INTO excursion (id, started_at, month, phase) VALUES ('e', '2026-10-05T08:00:00Z', 10, 'manana')").run();
    db.prepare("INSERT INTO excursion_target (excursion_id, species_id, prob) VALUES ('e', 1, 0.5)").run();
    db.prepare("DELETE FROM excursion WHERE id = 'e'").run();
    expect((db.prepare('SELECT COUNT(*) AS n FROM excursion_target').get() as { n: number }).n).toBe(0);
  });
});
