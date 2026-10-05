import { classifyMonth, normalizeMonths, prevMonth } from '@/lib/calendarLogic';
import { activityFactor, excursionProbability, fmtDuration, groupByGroup, monthScore, probabilityLevel, summarize } from '@/lib/excursionLogic';
import { unexploredCells } from '@/lib/heat';
import { estimateDownload, fmtBytes, lngLatToTile, tilesForArea } from '@/lib/offlineMath';

describe('probabilidad de excursión', () => {
  it('la escala logarítmica no deja que una especie aplaste al resto', () => {
    expect(monthScore(0, 100)).toBe(0);
    expect(monthScore(100, 100)).toBe(1);
    expect(monthScore(10, 1000)).toBeGreaterThan(0.3);
  });

  it('el horario del catálogo modula la franja', () => {
    expect(activityFactor('Diurno', 'manana')).toBe(1);
    expect(activityFactor('Diurno', 'noche')).toBeLessThan(0.2);
    expect(activityFactor('Nocturno', 'noche')).toBe(1);
    expect(activityFactor('Crepuscular', 'atardecer')).toBe(1);
    expect(activityFactor('De día y de noche', 'noche')).toBe(1);
    expect(activityFactor(null, 'noche')).toBeNull();
  });

  it('sin horario conocido no se ajusta y lo declara', () => {
    const a = excursionProbability({ monthCount: 50, maxMonthCount: 100, activity: null, phase: 'noche' });
    const b = excursionProbability({ monthCount: 50, maxMonthCount: 100, activity: 'Diurno', phase: 'noche' });
    expect(a.scheduleKnown).toBe(false);
    expect(b.scheduleKnown).toBe(true);
    expect(b.p).toBeLessThan(a.p);
  });

  it('etiqueta los niveles y agrupa por grupo animal', () => {
    expect(probabilityLevel(0.9).label).toBe('Muy probable');
    expect(probabilityLevel(0.4).label).toBe('Probable');
    expect(probabilityLevel(0.2).label).toBe('Posible');
    expect(probabilityLevel(0.01).label).toBe('Poco probable');
    const groups = groupByGroup([
      { grp: 'ave', p: 0.3 },
      { grp: 'reptil', p: 0.9 },
      { grp: 'ave', p: 0.7 },
    ]);
    expect(groups.map((g) => g.grp)).toEqual(['reptil', 'ave']);
    expect(groups[1].items.map((i) => i.p)).toEqual([0.7, 0.3]);
  });

  it('resume la salida', () => {
    const s = summarize(
      [
        { species_id: 1, seen: true },
        { species_id: 2, seen: false },
      ],
      1,
      '2026-10-05T08:00:00Z',
      '2026-10-05T09:30:00Z',
    );
    expect(s).toMatchObject({ seen: 1, total: 2, ratio: 0.5, minutes: 90, newSpecies: 1 });
    expect(fmtDuration(90)).toBe('1 h 30 min');
    expect(fmtDuration(45)).toBe('45 min');
  });
});

describe('calendario', () => {
  it('detecta pico, llegadas y despedidas con mínimos', () => {
    const month = new Map([[1, 40], [2, 30], [3, 2], [4, 20]]);
    const prev = new Map([[1, 5], [2, 30], [3, 40], [4, 18]]);
    const year = new Map([[1, 120], [2, 360], [3, 100], [4, 240]]);
    const r = classifyMonth(month, prev, year);
    expect(r.peak.map((e) => e.id)).toEqual([1]); // 40×12/120 = 4 veces lo normal
    expect(r.arriving.map((e) => e.id)).toEqual([1]);
    expect(r.leaving.map((e) => e.id)).toEqual([3]);
  });

  it('enero mira a diciembre y la tira se normaliza', () => {
    expect(prevMonth(1)).toBe(12);
    expect(prevMonth(5)).toBe(4);
    expect(normalizeMonths([0, 5, 10])).toEqual([0, 0.5, 1]);
    expect(normalizeMonths([0, 0])).toEqual([0, 0]);
  });
});

describe('zonas sin explorar', () => {
  const center = { lat: 38.38, lng: -0.5 };
  it('excluye las celdas con avistamientos y ordena por cercanía', () => {
    const all = unexploredCells(center, [], { radiusKm: 10, max: 500 });
    const visited = unexploredCells(center, [center], { radiusKm: 10, max: 500 });
    expect(visited.length).toBe(all.length - 1);
    const near = unexploredCells(center, [], { radiusKm: 10, max: 3 });
    expect(near).toHaveLength(3);
    for (const [w, s, e, n] of near) {
      expect(e).toBeGreaterThan(w);
      expect(n).toBeGreaterThan(s);
    }
  });
});

describe('sin conexión', () => {
  it('calcula la tesela de un punto conocido', () => {
    const t = lngLatToTile(-0.5, 38.38, 10);
    expect(t.x).toBeGreaterThan(505);
    expect(t.x).toBeLessThan(515);
    expect(t.y).toBeGreaterThan(380);
    expect(t.y).toBeLessThan(395);
    expect(lngLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1 });
  });

  it('el área crece con el radio y cada nivel tiene teselas', () => {
    const small = tilesForArea({ lat: 38.38, lng: -0.5 }, 3);
    const big = tilesForArea({ lat: 38.38, lng: -0.5 }, 8);
    expect(big.length).toBeGreaterThan(small.length);
    expect(new Set(small.map((t) => t.z))).toEqual(new Set([10, 11, 12, 13, 14]));
  });

  it('estima y formatea el tamaño', () => {
    const e = estimateDownload(100, 60);
    expect(e.photoBytes).toBe(60 * 150_000);
    expect(e.bytes).toBe(e.tileBytes + e.photoBytes);
    expect(fmtBytes(500_000)).toBe('500 kB');
    expect(fmtBytes(12_400_000)).toBe('12 MB');
  });
});
