import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * El índice del catálogo que baja la app (lo genera `tools/ … hosting.py` en
 * tools/out/indice.db), abierto con better-sqlite3 (trae FTS5). Se trabaja con
 * una copia: como hace la app con `ensureCountries`, se cargan las listas por
 * país, aquí todas de golpe desde la base completa (tools/out/catalogo.db).
 */

const OUT = path.join(__dirname, '..', '..', 'tools', 'out');

export function openIndex(): Database.Database {
  const tmp = path.join(os.tmpdir(), `zarpa-indice-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
  fs.copyFileSync(path.join(OUT, 'indice.db'), tmp);
  process.on('exit', () => fs.rmSync(tmp, { force: true }));
  const db = new Database(tmp);
  db.prepare('ATTACH ? AS full').run(path.join(OUT, 'catalogo.db'));
  db.exec(`INSERT INTO country (id, cc, obs) SELECT id, cc, obs FROM full.country;
           INSERT INTO country_loaded (cc, at) SELECT DISTINCT cc, 'pruebas' FROM full.country;`);
  db.exec('DETACH full');
  return db;
}

/** Nº de especies del índice (meta). */
export function speciesCount(db: Database.Database): number {
  return Number((db.prepare("SELECT value FROM meta WHERE key = 'species'").get() as { value: string }).value);
}
