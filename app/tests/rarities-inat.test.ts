import type { SpeciesRow } from '@/db/query';
import { base64Url, canContribute, observationBody, parseRedirect } from '@/lib/inat';
import { pickRarities, sinceDate } from '@/lib/rarities';
import type { Sighting } from '@/store/journal';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn(), openBrowserAsync: jest.fn() }));

const row = (id: number, rarity: number) => ({ id, rarity }) as unknown as SpeciesRow;

describe('rarezas cerca', () => {
  it('deja las raras que no tienes, de más rara a menos y por veces vista', () => {
    const rows = [row(1, 1), row(2, 4), row(3, 5), row(4, 4), row(5, 5)];
    const counts = new Map([
      [2, 3],
      [3, 1],
      [4, 9],
      [5, 2],
    ]);
    expect(pickRarities(rows, counts, new Set([5])).map((r) => r.id)).toEqual([3, 4, 2]);
  });

  it('acepta el mapa del cuaderno como «lo que ya tienes»', () => {
    expect(pickRarities([row(2, 4)], new Map(), new Map([[2, 1]]))).toEqual([]);
  });

  it('calcula la fecha de inicio en hora local', () => {
    expect(sinceDate(14, new Date(2026, 9, 5, 12))).toBe('2026-09-21');
  });
});

describe('aportar a iNaturalist', () => {
  it('codifica en base64 url sin relleno (PKCE)', () => {
    expect(base64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(base64Url(new TextEncoder().encode('Zarpa'))).toBe('WmFycGE');
  });

  it('lee el código y el estado de la URL de vuelta', () => {
    expect(parseRedirect('zarpa://inaturalist?code=abc%2B1&state=xyz')).toEqual({ code: 'abc+1', state: 'xyz' });
    expect(parseRedirect('zarpa://inaturalist')).toEqual({});
  });

  const s = {
    id: 'u1',
    species_id: 3017,
    created_at: '2026-10-05T08:12:00.000Z',
    lat: 40.41,
    lng: -3.7,
    accuracy: 12.6,
    photo: 'file:///x.jpg',
    note: '  Con crías ',
    method: 'ia',
  } as unknown as Sighting;

  it('arma la observación con especie, fecha, lugar y nota', () => {
    const { observation } = observationBody(s, { obscure: true, sci: 'Columba palumbus' });
    expect(observation).toMatchObject({
      taxon_id: 3017,
      species_guess: 'Columba palumbus',
      observed_on_string: '2026-10-05T08:12:00.000Z',
      latitude: 40.41,
      longitude: -3.7,
      positional_accuracy: 13,
      geoprivacy: 'obscured',
      description: 'Con crías',
      owners_identification_from_vision: true,
    });
  });

  it('solo se aporta con especie, lugar y foto', () => {
    expect(canContribute(s)).toBe(true);
    expect(canContribute({ ...s, lat: null })).toBe(false);
    expect(canContribute({ ...s, species_id: null })).toBe(false);
  });
});
