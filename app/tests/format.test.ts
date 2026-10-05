import { localHour } from '@/lib/remote';
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

describe('hora local de iNaturalist', () => {
  it('toma la hora del desfase de la observación, no la UTC', () => {
    expect(localHour('2023-07-19T19:22:00-06:00')).toBe(19);
    expect(localHour('2012-07-09T00:50:00+03:00')).toBe(0);
    expect(localHour(null)).toBeNull();
    expect(localHour('2012-07-09')).toBeNull();
  });
});
