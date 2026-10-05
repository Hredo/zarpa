import {
  computeStats,
  evaluateAll,
  evaluateMedal,
  markSeen,
  MEDAL_BY_ID,
  MEDALS,
  newUnlocks,
  streaks,
  tierOf,
  type CaughtSpecies,
} from '@/lib/achievements';
import { countriesOfPoints } from '@/lib/achievementsData';

const sp = (id: number, grp: string, rarity = 2, iucn: string | null = null): CaughtSpecies => ({ id, grp, rarity, iucn });
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe('niveles', () => {
  it('los umbrales dan bronce, plata y oro', () => {
    const t = [1, 10, 50] as const;
    expect([0, 1, 9, 10, 49, 50, 500].map((v) => tierOf(v, t))).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('el progreso se mide hacia el siguiente umbral', () => {
    const s = computeStats({ species: Array.from({ length: 5 }, (_, i) => sp(i, 'ave')), times: [], countries: [] });
    const ave = evaluateMedal(MEDAL_BY_ID['grupo-ave'], s);
    expect(ave.tier).toBe(1);
    expect(ave.next).toBe(10);
    expect(ave.progress).toBeCloseTo((5 - 1) / (10 - 1));
    const oro = evaluateMedal(MEDAL_BY_ID['grupo-ave'], computeStats({ species: Array.from({ length: 60 }, (_, i) => sp(i, 'ave')), times: [], countries: [] }));
    expect(oro.tier).toBe(3);
    expect(oro.next).toBeNull();
    expect(oro.progress).toBe(1);
  });
});

describe('estadísticas', () => {
  it('cuenta especies distintas por grupo, rareza y UICN', () => {
    const s = computeStats({
      species: [sp(1, 'ave', 1), sp(2, 'ave', 4, 'VU'), sp(3, 'anfibio', 5, 'CR'), sp(4, 'insecto', 3, 'LC'), sp(5, 'pez', 2, 'EN')],
      times: [],
      countries: [],
    });
    expect(s.species).toBe(5);
    expect(s.byGroup).toEqual({ ave: 2, anfibio: 1, insecto: 1, pez: 1 });
    expect(s.scarce).toBe(3);
    expect(s.rare).toBe(2);
    expect(s.legendary).toBe(1);
    expect(s.threatened).toBe(3);
    expect(s.critical).toBe(1);
  });

  it('un cuaderno vacío no gana ninguna medalla', () => {
    const states = evaluateAll(computeStats({ species: [], times: [], countries: [] }));
    expect(states).toHaveLength(MEDALS.length);
    expect(states.every((m) => m.tier === 0 && m.progress === 0)).toBe(true);
  });

  it('cuenta países y regiones (sin repetir)', () => {
    const s = computeStats({ species: [], times: [], countries: ['ES', 'es', 'FR', 'AR', 'AU'] });
    expect(s.countries).toBe(4);
    expect(s.regions).toBe(3); // Europa, Latinoamérica, Oceanía
  });

  it('el primer anfibio da bronce de anfibios y el primer cromo, el de Naturalista', () => {
    const states = evaluateAll(computeStats({ species: [sp(1, 'anfibio')], times: [], countries: [] }));
    const byId = Object.fromEntries(states.map((m) => [m.def.id, m.tier]));
    expect(byId['grupo-anfibio']).toBe(1);
    expect(byId['cuaderno']).toBe(1);
    expect(byId['grupo-ave']).toBe(0);
  });
});

describe('rachas', () => {
  const now = new Date(2026, 9, 5, 18);
  it('une días seguidos aunque haya varios avistamientos el mismo día', () => {
    const t = [at(2026, 10, 1), at(2026, 10, 1, 20), at(2026, 10, 2), at(2026, 10, 3), at(2026, 9, 20)];
    expect(streaks(t, now)).toEqual({ longest: 3, current: 0 });
  });

  it('la racha actual sigue viva si el último día es hoy o ayer', () => {
    expect(streaks([at(2026, 10, 4), at(2026, 10, 5)], now).current).toBe(2);
    expect(streaks([at(2026, 10, 3), at(2026, 10, 4)], now).current).toBe(2);
    expect(streaks([at(2026, 10, 2), at(2026, 10, 3)], now).current).toBe(0);
  });

  it('sin avistamientos no hay racha', () => {
    expect(streaks([], now)).toEqual({ longest: 0, current: 0 });
  });

  it('el cambio de hora no rompe una racha', () => {
    // 28 y 29 de marzo de 2026: en España cambia la hora en la madrugada del 29.
    const t = [at(2026, 3, 27, 23), at(2026, 3, 28, 12), at(2026, 3, 29, 12), at(2026, 3, 30, 1)];
    expect(streaks(t, new Date(2026, 2, 30, 12)).longest).toBe(4);
  });
});

describe('desbloqueos', () => {
  const stats = computeStats({ species: [sp(1, 'ave'), sp(2, 'ave')], times: [], countries: [] });
  const states = evaluateAll(stats);

  it('sin nada visto, todo lo ganado es nuevo (y primero lo de más nivel)', () => {
    const u = newUnlocks(states, {});
    expect(u.map((x) => x.id).sort()).toEqual(['cuaderno', 'grupo-ave']);
  });

  it('lo ya celebrado no vuelve a salir y subir de nivel sí', () => {
    const seen = markSeen({}, newUnlocks(states, {}));
    expect(newUnlocks(states, seen)).toEqual([]);
    const more = evaluateAll(computeStats({ species: Array.from({ length: 10 }, (_, i) => sp(i, 'ave')), times: [], countries: [] }));
    const u = newUnlocks(more, seen);
    expect(u.find((x) => x.id === 'grupo-ave')?.tier).toBe(2);
  });

  it('un salto de dos niveles se celebra una vez, con el más alto', () => {
    const big = evaluateAll(computeStats({ species: Array.from({ length: 12 }, (_, i) => sp(i, 'ave')), times: [], countries: [] }));
    const u = newUnlocks(big, {}).filter((x) => x.id === 'grupo-ave');
    expect(u).toHaveLength(1);
    expect(u[0].tier).toBe(2);
  });
});

describe('países sin conexión', () => {
  const cities = [
    { lat: 40.4168, lng: -3.7038, cc: 'ES' },
    { lat: 48.8566, lng: 2.3522, cc: 'FR' },
  ];
  it('asigna el país de la ciudad más cercana', () => {
    expect(countriesOfPoints([{ lat: 40.5, lng: -3.6 }, { lat: 48.9, lng: 2.4 }], cities).sort()).toEqual(['ES', 'FR']);
  });
  it('un punto lejos de cualquier ciudad no cuenta', () => {
    expect(countriesOfPoints([{ lat: -30, lng: 150 }], cities)).toEqual([]);
  });
});

describe('catálogo de medallas', () => {
  it('ids únicos, umbrales crecientes y un texto de objetivo por nivel', () => {
    const ids = new Set(MEDALS.map((m) => m.id));
    expect(ids.size).toBe(MEDALS.length);
    for (const m of MEDALS) {
      expect(m.thresholds[0]).toBeLessThan(m.thresholds[1]);
      expect(m.thresholds[1]).toBeLessThan(m.thresholds[2]);
      for (const t of m.thresholds) expect(m.goal(t).length).toBeGreaterThan(5);
    }
  });

  it('hay una medalla por cada grupo animal', () => {
    expect(MEDALS.filter((m) => m.family === 'group')).toHaveLength(15);
  });
});
