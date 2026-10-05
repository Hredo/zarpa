import { dayPhase, dayPhaseOfHour } from '@/lib/dayPhase';
import { fmtClock } from '@/lib/diaryFormat';
import { parseCurrentWeather, weatherFromFields, weatherInfo, weatherToFields, weatherUrl } from '@/lib/weather';

describe('fase del día', () => {
  it.each([
    [0, 'noche'],
    [4, 'noche'],
    [5, 'amanecer'],
    [7, 'amanecer'],
    [8, 'manana'],
    [12, 'mediodia'],
    [15, 'mediodia'],
    [16, 'tarde'],
    [19, 'atardecer'],
    [20, 'atardecer'],
    [21, 'noche'],
    [23, 'noche'],
  ])('las %i h son %s', (h, phase) => {
    expect(dayPhaseOfHour(h)).toBe(phase);
  });

  it('lee la hora local de una fecha', () => {
    expect(dayPhase(new Date(2026, 9, 5, 9, 41))).toBe('manana');
  });
});

describe('clima', () => {
  it('traduce códigos WMO a cielo e icono', () => {
    expect(weatherInfo(0, true)).toEqual({ label: 'Despejado', icon: 'sun' });
    expect(weatherInfo(0, false).icon).toBe('moon');
    expect(weatherInfo(2, true).icon).toBe('cloudSun');
    expect(weatherInfo(45).icon).toBe('fog');
    expect(weatherInfo(63).icon).toBe('rain');
    expect(weatherInfo(73).icon).toBe('snow');
    expect(weatherInfo(95).icon).toBe('storm');
  });

  it('lee la respuesta de Open-Meteo y ida y vuelta por las columnas', () => {
    const w = parseCurrentWeather(
      { current: { temperature_2m: 22.7, apparent_temperature: 24.3, relative_humidity_2m: 66, is_day: 1, weather_code: 2, wind_speed_10m: 2.9 } },
      new Date('2026-10-05T08:00:00Z'),
    );
    expect(w).toMatchObject({ code: 2, tempC: 22.7, humidity: 66, isDay: true });
    expect(weatherFromFields(weatherToFields(w!))).toEqual(w);
  });

  it('sin datos esenciales devuelve null y no inventa', () => {
    expect(parseCurrentWeather({})).toBeNull();
    expect(parseCurrentWeather({ current: { temperature_2m: 20 } })).toBeNull();
    expect(weatherFromFields({ weather_code: null, weather_temp: null })).toBeNull();
  });

  it('la URL no necesita clave', () => {
    expect(weatherUrl(38.3452, -0.481)).toContain('latitude=38.345&longitude=-0.481&current=');
  });

  it('formatea la duración de la nota de voz', () => {
    expect(fmtClock(65_400)).toBe('1:05');
    expect(fmtClock(0)).toBe('0:00');
  });
});
