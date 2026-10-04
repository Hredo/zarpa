import { fmtAgo, fmtCoords, fmtInt } from '@/lib/format';

describe('formatos en español', () => {
  it('agrupa miles como la RAE (sin punto en cuatro cifras)', () => {
    expect(fmtInt(1234)).toBe('1234');
    expect(fmtInt(96874)).toBe('96.874');
  });

  it('escribe coordenadas con hemisferio', () => {
    expect(fmtCoords(38.3452, -0.481)).toBe('38,3452° N · 0,4810° O');
    expect(fmtCoords(-33.9, 151.2)).toBe('33,9000° S · 151,2000° E');
  });

  it('dice cuánto hace en palabras', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    expect(fmtAgo('2026-10-04T08:00:00Z', now)).toBe('hoy');
    expect(fmtAgo('2026-10-03T08:00:00Z', now)).toBe('ayer');
    expect(fmtAgo('2026-09-20T08:00:00Z', now)).toBe('hace 14 días');
  });
});
