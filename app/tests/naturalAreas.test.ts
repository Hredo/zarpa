import { inside, rings, type OsmElement } from '@/lib/naturalAreas';

const sq = (x0: number, y0: number, x1: number, y1: number) => [
  { lon: x0, lat: y0 },
  { lon: x1, lat: y0 },
  { lon: x1, lat: y1 },
  { lon: x0, lat: y1 },
  { lon: x0, lat: y0 },
];

describe('espacios naturales del Atlas', () => {
  it('una vía cerrada es un anillo y cuenta los puntos de dentro', () => {
    const [ring] = rings({ type: 'way', geometry: sq(0, 0, 2, 2) });
    expect(inside([1, 1], ring)).toBe(true);
    expect(inside([3, 1], ring)).toBe(false);
  });

  it('une los trozos «outer» de una relación aunque vengan desordenados o al revés', () => {
    const rel: OsmElement = {
      type: 'relation',
      members: [
        { type: 'way', role: 'outer', geometry: [{ lon: 2, lat: 0 }, { lon: 2, lat: 2 }, { lon: 0, lat: 2 }] },
        { type: 'way', role: 'inner', geometry: sq(0.5, 0.5, 1, 1) },
        { type: 'way', role: 'outer', geometry: [{ lon: 0, lat: 0 }, { lon: 0, lat: 2 }].reverse().reverse() },
        { type: 'way', role: 'outer', geometry: [{ lon: 2, lat: 0 }, { lon: 0, lat: 0 }] },
      ],
    };
    const rs = rings(rel);
    expect(rs).toHaveLength(1);
    expect(inside([1.5, 1.5], rs[0])).toBe(true);
    expect(inside([2.5, 1], rs[0])).toBe(false);
  });

  it('ignora geometrías sin superficie', () => {
    expect(rings({ type: 'way', geometry: [{ lon: 0, lat: 0 }, { lon: 1, lat: 1 }] })).toEqual([]);
  });
});
