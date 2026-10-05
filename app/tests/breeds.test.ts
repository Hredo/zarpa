
import { BREED_COLUMNS, breedWhere } from '@/db/query';
import { openIndex } from './catalogIndex';

/*
 * Razas del catálogo empaquetado: que cada una venga de su autoridad, que la
 * búsqueda encuentre los nombres oficiales y que el filtro por país funcione.
 */
const db = openIndex();
const DOG = 47144;
const CATTLE = 74113;

function breeds(speciesId: number | null, q: Parameters<typeof breedWhere>[1], limit = 50) {
  const { where, params } = breedWhere(speciesId, q);
  return db.prepare(`SELECT ${BREED_COLUMNS} FROM breed b ${where} ORDER BY b.seq LIMIT ?`).all(...params, limit) as {
    id: string;
    species_id: number;
    authority: string;
    code: string | null;
    name: string;
    origin_cc: string | null;
    countries: string | null;
  }[];
}

afterAll(() => db.close());

describe('razas', () => {
  it('los perros son los de la nomenclatura de la FCI, con su número', () => {
    const rows = breeds(DOG, {}, 1000);
    expect(rows.length).toBeGreaterThan(300);
    expect(rows.every((r) => r.authority === 'fci' && /^\d+$/.test(r.code ?? ''))).toBe(true);
  });

  it('encuentra el pastor alemán por su nombre oficial en español (FCI 166)', () => {
    const rows = breeds(null, { q: 'pastor aleman' });
    const gsd = rows.find((r) => r.id === 'fci:166');
    expect(gsd?.name).toBe('Pastor Alemán');
    expect(gsd?.origin_cc).toBe('DE');
  });

  it('el ganado sale de DAD-IS (FAO) con razas de muchos países', () => {
    const rows = breeds(CATTLE, {}, 5000);
    const countries = new Set(rows.flatMap((r) => (r.countries ?? '').split(',').filter(Boolean)));
    expect(rows.some((r) => r.authority === 'fao')).toBe(true);
    expect(countries.size).toBeGreaterThan(100);
  });

  it('el filtro por país solo deja razas con origen o población allí', () => {
    const rows = breeds(CATTLE, { cc: 'JP' }, 200);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(`,${r.origin_cc ?? ''},${r.countries ?? ''},`).toContain(',JP,');
    }
  });

  it('cada raza tiene un identificador único y una fuente enlazable', () => {
    const dup = db.prepare('SELECT id, COUNT(*) AS n FROM breed GROUP BY id HAVING n > 1').all();
    expect(dup).toEqual([]);
    const noUrl = db.prepare("SELECT COUNT(*) AS n FROM breed WHERE url IS NULL OR url = ''").get() as { n: number };
    expect(noUrl.n).toBe(0);
  });

  it('una raza extinguida no aparece', () => {
    const extinct = db.prepare("SELECT COUNT(*) AS n FROM breed WHERE risk IN ('Extinta', 'Sólo crioconservada')").get() as { n: number };
    expect(extinct.n).toBe(0);
  });
});
