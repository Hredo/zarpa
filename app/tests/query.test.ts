import Database from 'better-sqlite3';
import path from 'node:path';

import { CATALOG_SPECIES } from '@/db/catalogAsset';
import { buildCountQuery, buildListQuery, COUNTRY_MIN_OBS, EMPTY_FILTERS, ftsQuery, type Filters } from '@/db/query';

/*
 * Las consultas del Bestiario contra el catálogo de verdad. Si `tools/` cambia
 * el esquema o el filtro por país deja de respetar el mínimo de observaciones,
 * esto falla antes de llegar al móvil.
 */
const db = new Database(path.join(__dirname, '..', 'assets', 'db', 'catalogo.db'), { readonly: true });
const ctx = { caughtIds: [] as number[], savedIds: [] as number[] };

function count(f: Partial<Filters>, c = ctx): number {
  const { sql, params } = buildCountQuery({ ...EMPTY_FILTERS, ...f }, c);
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

function list(f: Partial<Filters>, sort: 'album' | 'popular' | 'name' | 'rarity' = 'popular', limit = 20) {
  const { sql, params } = buildListQuery({ ...EMPTY_FILTERS, ...f }, ctx, sort, limit, 0);
  return db.prepare(sql).all(...params) as { id: number; sci: string; name_es: string | null; grp: string; rarity: number; rg_obs: number }[];
}

afterAll(() => db.close());

describe('catálogo', () => {
  it('sin filtros cuenta todas las especies del catálogo empaquetado', () => {
    expect(count({})).toBe(CATALOG_SPECIES);
  });

  it('busca sin tildes y por prefijo', () => {
    const sci = list({ q: 'gorrion comun' }).map((r) => r.sci);
    expect(sci).toContain('Passer domesticus');
    expect(list({ q: 'Passer dom' }).map((r) => r.sci)).toContain('Passer domesticus');
  });

  it('una búsqueda sin letras no filtra', () => {
    expect(ftsQuery('  ¿? ')).toBeNull();
    expect(count({ q: '¿?' })).toBe(CATALOG_SPECIES);
  });

  it('el filtro de álbum solo devuelve ese grupo', () => {
    const rows = list({ groups: ['ave'] }, 'popular', 100);
    expect(rows.length).toBe(100);
    expect(rows.every((r) => r.grp === 'ave')).toBe(true);
  });

  it('el país exige el mínimo de observaciones (no cuenta divagantes)', () => {
    const rows = list({ countries: ['ES'] }, 'popular', 50);
    expect(rows.length).toBeGreaterThan(0);
    const check = db.prepare('SELECT obs FROM country WHERE id = ? AND cc = ?');
    for (const r of rows) {
      const c = check.get(r.id, 'ES') as { obs: number } | undefined;
      expect(c?.obs ?? 0).toBeGreaterThanOrEqual(COUNTRY_MIN_OBS);
    }
  });

  it('avistadas / por avistar se reparten el catálogo', () => {
    const some = list({}, 'popular', 3).map((r) => r.id);
    const c = { caughtIds: some, savedIds: [] };
    expect(count({ caught: 'caught' }, c)).toBe(3);
    expect(count({ caught: 'missing' }, c)).toBe(CATALOG_SPECIES - 3);
  });

  it('ordena por rareza de la más rara a la más común', () => {
    const rows = list({}, 'rarity', 30);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].rarity).toBeGreaterThanOrEqual(rows[i].rarity);
  });

  it('la rareza corresponde a las observaciones con los cortes publicados', () => {
    const cuts = [
      [5000, 1],
      [1000, 2],
      [250, 3],
      [60, 4],
      [0, 5],
    ];
    const rows = db.prepare('SELECT rg_obs, rarity FROM species ORDER BY RANDOM() LIMIT 500').all() as { rg_obs: number; rarity: number }[];
    for (const r of rows) {
      const tier = cuts.find(([cut]) => r.rg_obs >= cut)![1];
      expect(r.rarity).toBe(tier);
    }
  });
});
