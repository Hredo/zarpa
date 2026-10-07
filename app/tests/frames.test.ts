import { squareInside } from '@/ai/frames';

describe('recorte del animal en la foto', () => {
  const W = 3000;
  const H = 4000;

  it('es un cuadrado de píxeles enteros que nunca se sale de la foto', () => {
    // Cajas en el centro, pegadas a cada borde y casi tan grandes como la foto.
    const boxes = [
      { x: 0.4, y: 0.4, w: 0.2, h: 0.15 },
      { x: 0, y: 0, w: 0.1, h: 0.1 },
      { x: 0.93, y: 0.95, w: 0.07, h: 0.05 },
      { x: 0.0001, y: 0.3333, w: 0.3333, h: 0.3333 },
      { x: 0.05, y: 0.05, w: 0.95, h: 0.95 },
    ];
    for (const b of boxes) {
      for (const [w, h] of [
        [W, H],
        [4000, 3000],
        [4031, 3023],
      ]) {
        const s = squareInside(b, w, h);
        expect(Number.isInteger(s.x) && Number.isInteger(s.y) && Number.isInteger(s.side)).toBe(true);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.side).toBeLessThanOrEqual(w);
        expect(s.y + s.side).toBeLessThanOrEqual(h);
        expect(s.side).toBeGreaterThan(0);
      }
    }
  });

  it('deja un margen alrededor del animal y lo mantiene centrado', () => {
    const s = squareInside({ x: 0.4, y: 0.45, w: 0.2, h: 0.1 }, W, H);
    expect(s.side).toBe(Math.floor(0.2 * W * 1.36));
    expect(s.x + s.side / 2).toBeCloseTo(0.5 * W, -1);
    expect(s.y + s.side / 2).toBeCloseTo(0.5 * H, -1);
  });
});
