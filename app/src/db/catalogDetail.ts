import { catalog, catalogInfo, journal } from './index';
import { catalogUrl, countryPath, parseCountry, parseShard, shardOf, shardPath, type ShardEntry } from './catalogRemote';
import { checkCatalogUpdate } from './catalogUpdate';

/*
 * Lo del catálogo que no viaja en el índice y se pide a Firebase Hosting
 * cuando hace falta:
 *
 *   - Fichas completas (resumen, galería con autoría, estado por regiones,
 *     países, fuentes…), en trozos de ~60 especies. Cada trozo bajado se
 *     guarda en la tabla `shard` del índice: abrir otra vez la ficha, o la de
 *     una especie del mismo trozo, ya no usa la red. La caché se poda a
 *     MAX_SHARDS trozos (los menos usados); los de especies vistas o guardadas
 *     se marcan `keep` y no se podan, para que el cuaderno funcione sin red.
 *   - Listas por país (filtro por país, «qué ver aquí», candidatas de la IA):
 *     se bajan una vez por país y se guardan en la tabla `country`.
 */

const MAX_SHARDS = 600;
const TIMEOUT_MS = 15_000;

async function getJson(path: string): Promise<{ status: number; json: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(catalogUrl(path), { signal: ctrl.signal });
    if (!res.ok) return { status: res.status, json: null };
    return { status: res.status, json: await res.json() };
  } finally {
    clearTimeout(timer);
  }
}

const memo = new Map<number, Record<string, ShardEntry>>();
const inflight = new Map<number, Promise<Record<string, ShardEntry> | null>>();

async function loadShard(n: number, keep: boolean): Promise<Record<string, ShardEntry> | null> {
  const { version } = catalogInfo();
  const db = catalog();
  const hit = memo.get(n);
  if (hit) {
    if (keep) await db.runAsync('UPDATE shard SET keep = 1 WHERE n = ?', [n]);
    return hit;
  }
  const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM shard WHERE n = ?', [n]);
  if (row) {
    const sp = parseShard(JSON.parse(row.json), version, n);
    if (sp) {
      memo.set(n, sp);
      await db.runAsync(`UPDATE shard SET used_at = ?${keep ? ', keep = 1' : ''} WHERE n = ?`, [Date.now(), n]);
      return sp;
    }
  }
  let res: { status: number; json: unknown };
  try {
    res = await getJson(shardPath(version, n));
  } catch {
    return null; // sin red: la ficha enseña lo que hay en el índice
  }
  if (res.status === 404) {
    // Esta versión del catálogo ya no está publicada: toca bajar la nueva.
    void checkCatalogUpdate({ force: true });
    return null;
  }
  const sp = parseShard(res.json, version, n);
  if (!sp) return null;
  memo.set(n, sp);
  await db.runAsync('INSERT OR REPLACE INTO shard (n, json, used_at, keep) VALUES (?, ?, ?, ?)', [n, JSON.stringify(res.json), Date.now(), keep ? 1 : 0]);
  await db.runAsync(
    'DELETE FROM shard WHERE keep = 0 AND n NOT IN (SELECT n FROM shard WHERE keep = 0 ORDER BY used_at DESC LIMIT ?)',
    [MAX_SHARDS],
  );
  return sp;
}

function shard(n: number, keep = false): Promise<Record<string, ShardEntry> | null> {
  let p = inflight.get(n);
  if (!p) {
    p = loadShard(n, keep).finally(() => inflight.delete(n));
    inflight.set(n, p);
  }
  return p;
}

/**
 * Lo que la ficha de una especie trae de Hosting. `null` si no se pudo bajar
 * (sin red y sin copia guardada): la ficha enseña lo que hay en el índice.
 */
export async function speciesExtra(id: number): Promise<ShardEntry | null> {
  const sp = await shard(shardOf(id, catalogInfo().shards));
  if (!sp) return null;
  return sp[String(id)] ?? {};
}

/**
 * Baja (si falta) y guarda sin caducidad las fichas de estas especies: las
 * del cuaderno, las guardadas, las de una zona descargada para el campo.
 * Devuelve cuántos trozos no se pudieron bajar.
 */
export async function keepSpecies(ids: number[], onProgress?: (done: number, total: number) => void): Promise<number> {
  const { shards } = catalogInfo();
  const ns = [...new Set(ids.map((id) => shardOf(id, shards)))];
  let failed = 0;
  let done = 0;
  for (let i = 0; i < ns.length; i += 4) {
    const batch = await Promise.all(ns.slice(i, i + 4).map((n) => shard(n, true)));
    failed += batch.filter((s) => !s).length;
    done += batch.length;
    onProgress?.(done, ns.length);
  }
  return failed;
}

/** Guarda las fichas de las especies del cuaderno y de las guardadas (al arrancar). */
export async function keepJournalSpecies(): Promise<number> {
  const rows = await journal().getAllAsync<{ id: number }>(
    'SELECT DISTINCT species_id AS id FROM sighting WHERE species_id IS NOT NULL UNION SELECT species_id FROM saved',
  );
  return keepSpecies(rows.map((r) => r.id));
}

/** Trozos guardados y cuánto ocupan (para el perfil). */
export async function cachedDetailStats(): Promise<{ shards: number; bytes: number }> {
  const row = await catalog().getFirstAsync<{ n: number; b: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(length(json)), 0) AS b FROM shard');
  return { shards: row?.n ?? 0, bytes: row?.b ?? 0 };
}

const countryInflight = new Map<string, Promise<boolean>>();

async function loadCountry(cc: string): Promise<boolean> {
  const db = catalog();
  if (await db.getFirstAsync('SELECT 1 FROM country_loaded WHERE cc = ?', [cc])) return true;
  const { version } = catalogInfo();
  let res: { status: number; json: unknown };
  try {
    res = await getJson(countryPath(version, cc));
  } catch {
    return false;
  }
  // Un país sin especies con datos no tiene fichero: se anota vacío.
  const rows = res.status === 404 ? [] : parseCountry(res.json, version, cc);
  if (!rows) return false;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM country WHERE cc = ?', [cc]);
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      await db.runAsync(`INSERT OR REPLACE INTO country (id, cc, obs) VALUES ${chunk.map(() => '(?, ?, ?)').join(',')}`, chunk.flatMap(([id, obs]) => [id, cc, obs]));
    }
    await db.runAsync('INSERT OR REPLACE INTO country_loaded (cc, at) VALUES (?, ?)', [cc, new Date().toISOString()]);
  });
  return true;
}

/**
 * Asegura que están en el índice las especies de estos países (códigos ISO).
 * Devuelve false si alguno no se pudo bajar (sin red): las consultas por país
 * darán menos resultados hasta que vuelva la conexión.
 */
export async function ensureCountries(ccs: readonly string[]): Promise<boolean> {
  const list = [...new Set(ccs.map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))];
  const results = await Promise.all(
    list.map((cc) => {
      let p = countryInflight.get(cc);
      if (!p) {
        p = loadCountry(cc).finally(() => countryInflight.delete(cc));
        countryInflight.set(cc, p);
      }
      return p;
    }),
  );
  return results.every(Boolean);
}
