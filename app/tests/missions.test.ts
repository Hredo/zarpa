
import { dayKey, isoWeek, monthRange } from '@/lib/gameUtil';
import {
  missionProgress,
  seasonalMissions,
  seasonOf,
  suggestSpecies,
  weeklyMissions,
  type Mission,
  type SightingLite,
} from '@/lib/missions';
import { matcherSql, matches, type Matcher, type Reader, type SpeciesMeta } from '@/lib/speciesMatch';
import { openIndex } from './catalogIndex';

const db = openIndex();
const reader: Reader = {
  getAllAsync: async <T,>(sql: string, params: (string | number)[]) => db.prepare(sql).all(...params) as T[],
};
afterAll(() => db.close());

const meta = (over: Partial<SpeciesMeta>): SpeciesMeta => ({
  id: 1,
  grp: 'ave',
  rarity: 2,
  iucn: null,
  envs: 0,
  diet: null,
  family: null,
  order: null,
  migration: null,
  ...over,
});

describe('semana ISO', () => {
  it('el lunes y el domingo son la misma semana; el lunes siguiente, otra', () => {
    const mon = isoWeek(new Date(2026, 9, 5));
    expect(isoWeek(new Date(2026, 9, 11, 23, 30)).id).toBe(mon.id);
    expect(isoWeek(new Date(2026, 9, 12)).id).not.toBe(mon.id);
    expect(mon.id).toBe('2026-W41');
  });
  it('a caballo de año: el 1 de enero de 2027 aún es la semana 53 de 2026', () => {
    expect(isoWeek(new Date(2027, 0, 1)).id).toBe('2026-W53');
  });
});

describe('retos semanales', () => {
  it('son deterministas y distintos cada semana', () => {
    const a = weeklyMissions(new Date(2026, 9, 7));
    const b = weeklyMissions(new Date(2026, 9, 11, 22));
    expect(a).toEqual(b);
    const all = new Set<string>();
    for (let w = 0; w < 20; w++) all.add(weeklyMissions(new Date(2026, 0, 5 + w * 7)).map((m) => m.title).join('|'));
    expect(all.size).toBeGreaterThan(10);
  });

  it('son tres: fácil, medio y difícil, con sello de bronce, plata y oro', () => {
    for (let w = 0; w < 30; w++) {
      const ms = weeklyMissions(new Date(2026, 0, 5 + w * 7));
      expect(ms.map((m) => m.reward.tier)).toEqual([1, 2, 3]);
      expect(new Set(ms.map((m) => m.id)).size).toBe(3);
      for (const m of ms) {
        expect(m.target).toBeGreaterThanOrEqual(1);
        expect(m.title.length).toBeGreaterThan(8);
        expect(m.title).not.toMatch(/undefined|NaN/);
        expect(new Date(m.to).getTime() - new Date(m.from).getTime()).toBeGreaterThanOrEqual(6.9 * 86_400_000);
      }
    }
  });
});

describe('temporada', () => {
  it('estación por mes y hemisferio', () => {
    expect(seasonOf(9, 38)).toBe('otono'); // octubre en Alicante
    expect(seasonOf(9, -34)).toBe('primavera'); // octubre en Buenos Aires
    expect(seasonOf(0, 40)).toBe('invierno');
    expect(seasonOf(6, 40)).toBe('verano');
    expect(seasonOf(6, -33)).toBe('invierno');
    expect(seasonOf(3, 5)).toBe('tropico');
    expect(seasonOf(3, null)).toBe('primavera');
  });

  it('dos retos al mes, estables dentro del mes y dentro de su mes natural', () => {
    const a = seasonalMissions(new Date(2026, 9, 2), 38);
    const b = seasonalMissions(new Date(2026, 9, 30), 38);
    expect(a).toHaveLength(2);
    expect(a).toEqual(b);
    const m = monthRange(new Date(2026, 9, 15));
    expect(a[0].from).toBe(m.start.toISOString());
    expect(a[0].to).toBe(m.end.toISOString());
  });

  it('en el hemisferio sur el mismo mes propone otra cosa', () => {
    const north = seasonalMissions(new Date(2026, 9, 2), 40).map((m) => m.id.split(':')[1]);
    const south = seasonalMissions(new Date(2026, 9, 2), -34).map((m) => m.id.split(':')[1]);
    expect(north[0]).toBe('otono');
    expect(south[0]).toBe('primavera');
  });
});

describe('avance', () => {
  const week = weeklyMissions(new Date(2026, 9, 7));
  const inWeek = (d: number) => new Date(2026, 9, 5 + d, 10).toISOString();

  const mission = (over: Partial<Mission>): Mission => ({ ...week[0], ...over });

  it('cuenta especies distintas del grupo dentro del periodo', () => {
    const m = mission({ unit: 'especies', target: 2, match: { grp: 'ave' } });
    const s: SightingLite[] = [
      { species_id: 1, created_at: inWeek(0) },
      { species_id: 1, created_at: inWeek(1) },
      { species_id: 2, created_at: inWeek(1) },
      { species_id: 3, created_at: inWeek(2) },
      { species_id: 4, created_at: new Date(2026, 9, 1).toISOString() },
    ];
    const metas = new Map([1, 2, 3, 4].map((id) => [id, meta({ id, grp: id === 3 ? 'reptil' : 'ave' })]));
    const p = missionProgress(m, s, metas);
    expect(p.value).toBe(2);
    expect(p.done).toBe(true);
    expect(p.ratio).toBe(1);
  });

  it('cuenta días distintos para los retos de constancia', () => {
    const m = mission({ unit: 'dias', target: 3, match: {} });
    const s: SightingLite[] = [
      { species_id: 1, created_at: inWeek(0) },
      { species_id: 2, created_at: inWeek(0) },
      { species_id: null, created_at: inWeek(2) },
    ];
    const p = missionProgress(m, s, new Map());
    expect(p.value).toBe(2);
    expect(p.done).toBe(false);
    expect(p.ratio).toBeCloseTo(2 / 3);
  });

  it('el último instante del periodo ya no cuenta', () => {
    const m = mission({ unit: 'especies', target: 1, match: {} });
    const s: SightingLite[] = [{ species_id: 1, created_at: m.to }];
    expect(missionProgress(m, s, new Map([[1, meta({})]])).value).toBe(0);
  });

  it('el polinizador exige un insecto de abejas, moscas de las flores o mariposas', () => {
    const m: Matcher = { pollinator: true };
    expect(matches(meta({ grp: 'insecto', family: 'Apidae' }), m)).toBe(true);
    expect(matches(meta({ grp: 'insecto', order: 'Lepidoptera' }), m)).toBe(true);
    expect(matches(meta({ grp: 'insecto', family: 'Carabidae', order: 'Coleoptera' }), m)).toBe(false);
    expect(matches(meta({ grp: 'ave', diet: 'Nectarívoro' }), m)).toBe(false);
  });

  it('dayKey usa el día local', () => {
    expect(dayKey(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
  });
});

describe('condiciones: JS y SQL coinciden en el catálogo real', () => {
  const cases: Matcher[] = [
    { grp: 'anfibio' },
    { minRarity: 4 },
    { iucn: ['VU', 'EN', 'CR'] },
    { env: 8 },
    { grp: 'ave', migratory: true },
    { pollinator: true },
  ];
  for (const m of cases) {
    it(`coincide para ${JSON.stringify(m)}`, () => {
      const { clauses, params } = matcherSql(m);
      const where = clauses.map((c) => `(${c})`).join(' AND ');
      const rows = db
        .prepare(
          `SELECT s.id, s.grp, s.rarity, s.iucn, s.envs, s.diet, s.family_sci AS family, s.order_sci AS "order", d.migration
           FROM species_v s LEFT JOIN detail d ON d.id = s.id WHERE s.id % 25 = 0`,
        )
        .all() as SpeciesMeta[];
      const ids = new Set(
        (db
          .prepare(`SELECT s.id FROM species_v s LEFT JOIN detail d ON d.id = s.id WHERE ${where}`)
          .all(...params) as { id: number }[]).map((r) => r.id),
      );
      let hits = 0;
      for (const r of rows) {
        expect(matches(r, m)).toBe(ids.has(r.id));
        if (ids.has(r.id)) hits++;
      }
      expect(hits).toBeGreaterThan(0);
    });
  }
});

describe('especies propuestas', () => {
  it('son de España, con foto y nombre en español, y cumplen el reto', async () => {
    const m = seasonalMissions(new Date(2026, 9, 2), 38).find((x) => x.kind === 'migradora' || x.kind === 'ambiente' || x.kind === 'grupo')!;
    const out = await suggestSpecies(reader, m, 'ES', '2026-10:ES');
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(3);
    for (const s of out) {
      expect(s.img).toBeTruthy();
      expect(s.name_es).toBeTruthy();
      const c = db.prepare('SELECT obs FROM country WHERE id = ? AND cc = ?').get(s.id, 'ES') as { obs: number };
      expect(c.obs).toBeGreaterThanOrEqual(3);
    }
    expect(await suggestSpecies(reader, m, 'ES', '2026-10:ES')).toEqual(out);
  });
});
