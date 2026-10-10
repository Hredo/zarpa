import { parseCurrentWeather, type Weather } from '@/lib/weather';
import { conditionsOf, profileOf, rankByWeather, seasonMonths, weatherFit, weatherHeadline, type FaunaTaxon } from '@/lib/weatherFauna';

const w = (over: Partial<Weather> = {}): Weather => ({
  code: 0,
  tempC: 20,
  feelsC: 20,
  humidity: 50,
  windKmh: 5,
  isDay: true,
  at: '2026-10-10T11:00:00Z',
  localTime: '2026-10-10T13:00',
  sunrise: '2026-10-10T08:00',
  sunset: '2026-10-10T19:20',
  ...over,
});
const taxon = (over: Partial<FaunaTaxon>): FaunaTaxon => ({ grp: 'insecto', class_sci: null, order_sci: null, family_sci: null, medium: 1, activity: null, ...over });

const frog = taxon({ grp: 'anfibio', class_sci: 'Amphibia', order_sci: 'Anura' });
const lizard = taxon({ grp: 'reptil', class_sci: 'Squamata', order_sci: 'Squamata', family_sci: 'Lacertidae' });
const butterfly = taxon({ order_sci: 'Lepidoptera', family_sci: 'Nymphalidae' });
const snail = taxon({ grp: 'molusco', class_sci: 'Gastropoda', order_sci: 'Stylommatophora', family_sci: 'Helicidae' });
const owl = taxon({ grp: 'ave', class_sci: 'Aves', order_sci: 'Strigiformes', family_sci: 'Strigidae' });
const bat = taxon({ grp: 'mamifero', class_sci: 'Mammalia', order_sci: 'Chiroptera', family_sci: 'Vespertilionidae' });
const fox = taxon({ grp: 'mamifero', class_sci: 'Mammalia', order_sci: 'Carnivora', family_sci: 'Canidae', activity: 'Nocturno y crepuscular' });

describe('clima de Open-Meteo para «el tiempo hoy»', () => {
  it('lee lluvia, nubes, la hora local y la salida y puesta del sol', () => {
    const got = parseCurrentWeather({
      current: { time: '2026-10-10T13:15', temperature_2m: 14.2, weather_code: 61, is_day: 1, precipitation: 0.6, cloud_cover: 90, relative_humidity_2m: 91 },
      daily: { sunrise: ['2026-10-10T08:05'], sunset: ['2026-10-10T19:21'] },
    });
    expect(got).toMatchObject({ code: 61, tempC: 14.2, precipMm: 0.6, cloud: 90, localTime: '2026-10-10T13:15', sunrise: '2026-10-10T08:05', sunset: '2026-10-10T19:21' });
  });

  it('sabe si es la hora del amanecer o del atardecer', () => {
    expect(conditionsOf(w({ localTime: '2026-10-10T19:00' })).twilight).toBe(true);
    expect(conditionsOf(w()).twilight).toBe(false);
  });
});

describe('qué sale con cada tiempo', () => {
  it('clasifica por grupo y taxonomía', () => {
    expect(profileOf(frog)).toBe('anfibio');
    expect(profileOf(butterfly)).toBe('mariposa');
    expect(profileOf(taxon({ order_sci: 'Lepidoptera', family_sci: 'Noctuidae' }))).toBe('polilla');
    expect(profileOf(snail)).toBe('humedad');
    expect(profileOf(taxon({ grp: 'molusco', class_sci: 'Gastropoda', medium: 4 }))).toBe('agua');
    expect(profileOf(owl)).toBe('nocturna');
    expect(profileOf(bat)).toBe('murcielago');
    expect(profileOf(taxon({ grp: 'reptil', family_sci: 'Phyllodactylidae' }))).toBe('geco');
    expect(profileOf(taxon({ order_sci: 'Hymenoptera', family_sci: 'Formicidae' }))).toBe('hormiga');
    expect(profileOf(taxon({ order_sci: 'Hymenoptera', family_sci: 'Cynipidae' }))).toBe('insecto');
  });

  it('con lluvia salen anfibios y caracoles, y se esconden reptiles y mariposas', () => {
    const rain = conditionsOf(w({ code: 61, tempC: 14, humidity: 92, precipMm: 0.8 }));
    expect(weatherFit(frog, rain).score).toBe(3);
    expect(weatherFit(snail, rain).score).toBe(3);
    expect(weatherFit(lizard, rain).score).toBe(0);
    expect(weatherFit(butterfly, rain).score).toBeLessThan(1);
  });

  it('con sol y calma salen reptiles y mariposas', () => {
    const sun = conditionsOf(w({ code: 0, tempC: 22 }));
    expect(weatherFit(lizard, sun).score).toBe(3);
    expect(weatherFit(butterfly, sun).score).toBe(3);
    expect(weatherFit(snail, sun).score).toBeLessThan(2);
  });

  it('de noche, rapaces nocturnas y murciélagos; un nocturno de día casi no se ve', () => {
    const night = conditionsOf(w({ code: 0, tempC: 16, isDay: false, localTime: '2026-10-10T23:30' }));
    expect(weatherFit(owl, night).score).toBe(3);
    expect(weatherFit(bat, night).score).toBe(3);
    expect(weatherFit(fox, conditionsOf(w())).score).toBeLessThanOrEqual(0.5);
  });

  it('ordena lo de la zona, deja fuera lo que ya tienes y lo que no saldrá, y lo resume', () => {
    const rain = conditionsOf(w({ code: 63, tempC: 15, humidity: 95, precipMm: 2 }));
    const rows = [
      { id: 1, ...frog },
      { id: 2, ...lizard },
      { id: 3, ...snail },
      { id: 4, ...frog },
    ];
    const ranked = rankByWeather(rows, new Map([[1, 3], [2, 50], [3, 40], [4, 9]]), rain, new Set([4]));
    expect(ranked.map((r) => r.id)).toEqual([3, 1]);
    expect(ranked[0].reason).toBe('Salen con la lluvia');
    expect(weatherHeadline('Lluvia', rain, ranked)).toBe('Lluvia y 15 °C: buen momento para ver caracoles, babosas y lombrices, y anfibios.');
    expect(weatherHeadline('Despejado', rain, [])).toContain('pocos animales');
  });

  it('mezcla tipos de animales antes de repetir', () => {
    const sun = conditionsOf(w({ code: 0, tempC: 22 }));
    const rows = [...Array.from({ length: 8 }, (_, i) => ({ id: i + 1, ...butterfly })), { id: 99, ...lizard }];
    const counts = new Map(rows.map((r) => [r.id, r.id === 99 ? 1 : 100]));
    const ranked = rankByWeather(rows, counts, sun, new Set(), 6, 5);
    expect(ranked.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 99]);
  });

  it('esta época son el mes actual y los dos de al lado', () => {
    expect(seasonMonths(new Date(2026, 0, 15))).toEqual([12, 1, 2]);
    expect(seasonMonths(new Date(2026, 11, 15))).toEqual([11, 12, 1]);
  });
});
