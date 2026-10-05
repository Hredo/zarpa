import { containDst, coverSrc, ellipsize, fitFontSize, iucnIndex } from '@/lib/cardMath';
import { higher, maskLabels, splitSets, summarizeList } from '@/lib/compare';
import { kidsFacts, type KidsInput } from '@/lib/kids';
import {
  barFractions,
  formatLength,
  formatMass,
  pickReference,
  ratioPhrase,
  sizeKindOf,
} from '@/lib/sizeScale';
import { authorOf, parseSounds, placeLabel, waveformBars, type RawObservation } from '@/lib/sounds';

const base: KidsInput = {
  grp: 'ave',
  singular: 'Ave',
  diet: null,
  medium: 0,
  countries: 0,
  endemic: [],
  iucn: null,
  rarity: 3,
  domestic: 0,
};

describe('modo niños: frases', () => {
  it('solo dice lo que sabe', () => {
    expect(kidsFacts(base).map((f) => f.text)).toEqual(['Es un ave']);
  });

  it('usa plantillas cortas con los datos del catálogo', () => {
    const texts = kidsFacts({
      ...base,
      diet: 'Invertívoro',
      medium: 1 | 2,
      countries: 12,
      iucn: 'EN',
      rarity: 5,
    }).map((f) => f.text);
    expect(texts).toContain('Come insectos y otros bichitos');
    expect(texts).toContain('Vive en la tierra y los ríos y lagos');
    expect(texts).toContain('Vive en 12 países');
    expect(texts).toContain('Está en peligro: quedan pocos');
    expect(texts).toContain('Es muy difícil de encontrar');
  });

  it('singular de un país, endemismos y esponja', () => {
    expect(kidsFacts({ ...base, countries: 1 }).map((f) => f.text)).toContain('Vive en un solo país');
    expect(kidsFacts({ ...base, countries: 9, endemic: ['Madagascar'] }).map((f) => f.text)).toContain('Solo vive en Madagascar');
    expect(kidsFacts({ ...base, grp: 'esponja', singular: 'Esponja' })[0].text).toBe('Es una esponja');
  });

  it('el tamaño solo sale si existe', () => {
    expect(kidsFacts(base).some((f) => f.icon === 'ruler' || f.icon === 'weight')).toBe(false);
    const withSize = kidsFacts({ ...base, length_mm: 300, mass_g: 1500 }).map((f) => f.text);
    expect(withSize).toContain('Mide hasta 30 cm');
    expect(withSize).toContain('Pesa unos 1,5 kg');
  });

  it('las frases de peligro cubren la escala de la UICN y no inventan DD', () => {
    for (const code of ['CR', 'EN', 'VU', 'NT', 'LC', 'EW', 'EX']) {
      expect(kidsFacts({ ...base, iucn: code }).length).toBeGreaterThan(1);
    }
    expect(kidsFacts({ ...base, iucn: 'DD' })).toHaveLength(1);
  });
});

describe('comparativa de tamaño', () => {
  it('elige la referencia más cercana en escala logarítmica', () => {
    expect(pickReference('length', 12).key).toBe('coin');
    expect(pickReference('length', 150).key).toBe('hand');
    expect(pickReference('length', 900).key).toBe('person');
    expect(pickReference('length', 25000).key).toBe('person');
    expect(pickReference('mass', 5).key).toBe('coin');
    expect(pickReference('mass', 2500).key).toBe('sugar');
    expect(pickReference('mass', 400000).key).toBe('person');
  });

  it('la barra mayor ocupa todo y la menor nunca desaparece', () => {
    expect(barFractions(1700, 1700)).toEqual({ animal: 1, ref: 1 });
    const f = barFractions(0.5, 1700);
    expect(f.ref).toBe(1);
    expect(f.animal).toBe(0.025);
    const g = barFractions(85, 170);
    expect(g.animal).toBeCloseTo(0.5);
  });

  it('formatea medidas en español', () => {
    expect(formatLength(3)).toBe('3 mm');
    expect(formatLength(120)).toBe('12 cm');
    expect(formatLength(1700)).toBe('1,7 m');
    expect(formatMass(0.5)).toBe('0,5 g');
    expect(formatMass(250)).toBe('250 g');
    expect(formatMass(3400)).toBe('3,4 kg');
    expect(formatMass(4_200_000)).toBe('4,2 t');
  });

  it('frases de proporción', () => {
    const hand = pickReference('length', 180);
    expect(ratioPhrase('length', 180, hand)).toBe('Casi igual que tu mano');
    expect(ratioPhrase('length', 540, hand)).toBe('3 veces más larga que tu mano');
    expect(ratioPhrase('length', 90, hand)).toBe('2 veces más corta que tu mano');
    expect(ratioPhrase('mass', 140000, pickReference('mass', 140000))).toBe('2 veces más pesada que una persona');
  });

  it('sin masa ni longitud no hay bloque; prefiere la longitud', () => {
    expect(sizeKindOf({})).toBeNull();
    expect(sizeKindOf({ mass_g: null, length_mm: null })).toBeNull();
    expect(sizeKindOf({ mass_g: 0, length_mm: 0 })).toBeNull();
    expect(sizeKindOf({ mass_g: 10 })).toEqual({ kind: 'mass', value: 10 });
    expect(sizeKindOf({ mass_g: 10, length_mm: 200 })).toEqual({ kind: 'length', value: 200 });
  });
});

describe('comparar especies', () => {
  it('reparte países en común y propios', () => {
    expect(splitSets(['ES', 'FR', 'PT'], ['FR', 'IT', 'ES'])).toEqual({ both: ['ES', 'FR'], onlyA: ['PT'], onlyB: ['IT'] });
  });
  it('decodifica máscaras', () => {
    expect(maskLabels(5, [{ bit: 1, label: 'a' }, { bit: 2, label: 'b' }, { bit: 4, label: 'c' }])).toEqual(['a', 'c']);
  });
  it('resume listas largas y señala el mayor', () => {
    expect(summarizeList(['a', 'b', 'c'], 5)).toBe('a, b, c');
    expect(summarizeList(['a', 'b', 'c', 'd'], 2)).toBe('a, b y 2 más');
    expect(higher(3, 2)).toBe('a');
    expect(higher(1, 2)).toBe('b');
    expect(higher(2, 2)).toBeNull();
    expect(higher(null, 2)).toBeNull();
  });
});

describe('sonidos de iNaturalist', () => {
  const obs = (id: number, user: string, ext: string, license: string | null, place = 'Madrid, ES'): RawObservation => ({
    id,
    place_guess: place,
    observed_on: '2024-05-01',
    user: { login: user },
    sounds: [
      {
        id: id * 10,
        file_url: `https://static.inaturalist.org/sounds/${id}.${ext}?1`,
        license_code: license,
        attribution: `(c) ${user}, some rights reserved (CC BY-NC)`,
      },
    ],
  });

  it('solo licencias libres sin NC, formatos reproducibles, un sonido por autor y WAV al final', () => {
    const list = parseSounds([
      obs(1, 'ana', 'wav', 'cc-by'),
      obs(2, 'ana', 'm4a', 'cc-by'),
      obs(3, 'beto', 'mp3', null),
      obs(4, 'carla', 'ogg', 'cc-by'),
      obs(5, 'dani', 'mp3', 'cc-by-nc'),
      obs(6, 'eva', 'mp3', 'cc-by-nd'),
    ]);
    expect(list.map((s) => s.author)).toEqual(['ana', 'eva']);
    expect(list[0].url).toContain('/2.m4a');
    expect(list[1].licenseLabel).toBe('CC BY-ND');
    expect(list[0].obsUrl).toBe('https://www.inaturalist.org/observations/2');
  });

  it('autor y lugar legibles', () => {
    expect(authorOf('(c) Misha Zitser, some rights reserved (CC BY-NC)', 'mzitser')).toBe('Misha Zitser');
    expect(authorOf(null, 'mzitser')).toBe('mzitser');
    expect(placeLabel('Madrid, ES')).toBe('Madrid, España');
    expect(placeLabel('ES')).toBe('España');
    expect(placeLabel('  ')).toBeNull();
  });

  it('la forma de onda es estable por sonido', () => {
    expect(waveformBars(7)).toEqual(waveformBars(7));
    expect(waveformBars(7)).not.toEqual(waveformBars(8));
    expect(waveformBars(7, 30)).toHaveLength(30);
    expect(Math.min(...waveformBars(99))).toBeGreaterThanOrEqual(0.15);
  });
});

describe('cromo para compartir', () => {
  it('cover recorta lo que sobra sin deformar', () => {
    const r = coverSrc(2000, 1000, 500, 500);
    expect(r).toEqual({ x: 500, y: 0, width: 1000, height: 1000 });
  });
  it('contain centra', () => {
    const r = containDst(100, 200, { x: 0, y: 0, width: 400, height: 400 });
    expect(r).toEqual({ x: 100, y: 0, width: 200, height: 400 });
  });
  it('ellipsize y fitFontSize', () => {
    const measure = (t: string) => t.length * 10;
    expect(ellipsize('abcdefghij', measure, 60)).toBe('abcde…');
    expect(ellipsize('abc', measure, 60)).toBe('abc');
    expect(fitFontSize((s) => s * 5, 200, 92, 48)).toBe(48);
    expect(fitFontSize((s) => s * 2, 200, 92, 48)).toBe(92);
    expect(fitFontSize((s) => s * 2, 150, 92, 48)).toBe(74);
  });
  it('posición en la escala UICN', () => {
    expect(iucnIndex('LC')).toBe(0);
    expect(iucnIndex('EX')).toBe(6);
    expect(iucnIndex('DD')).toBe(-1);
    expect(iucnIndex(null)).toBe(-1);
  });
});
