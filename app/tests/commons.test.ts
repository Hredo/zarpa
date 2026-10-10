import { anatomyCategories, bookSource, captionIsAbout, interleave, isAnatomyCaption, parseZenodoFigures } from '@/lib/anatomy';
import {
  looksLikeDrawing,
  mergeMedia,
  parseAudioPages,
  parseImagePages,
  stripHtml,
  type CommonsMedia,
} from '@/lib/commons';
import { commonsToSounds, mergeSounds, parseSounds, type RawObservation } from '@/lib/sounds';
import { withUserAgent } from '@/lib/urls';

describe('láminas anatómicas de libros (Commons)', () => {
  it('solo baja a las categorías de anatomía, esqueleto y cráneo, sin huellas ni arte', () => {
    expect(
      anatomyCategories([
        'Category:Vulpes vulpes anatomy',
        'Category:Vulpes vulpes in art',
        'Category:Vulpes vulpes tracks',
        'Category:Sus scrofa (illustrations)',
        'Category:Vulpes vulpes feces',
        'Category:Vulpes vulpes skulls',
        'Category:Red fox tails',
        'Category:Vulpes vulpes teeth',
      ]),
    ).toEqual(['Category:Vulpes vulpes anatomy', 'Category:Vulpes vulpes skulls', 'Category:Vulpes vulpes teeth']);
  });

  it('distingue una lámina publicada de una foto propia por su origen', () => {
    expect(bookSource('File:British Pleistocene Mammalia (1866) Red Fox Cranium.png', 'Plate III in: A monograph of the British Pleistocene Mammalia', '1909')).toEqual({
      source: 'Plate III in: A monograph of the British Pleistocene Mammalia',
      year: 1909,
    });
    expect(bookSource('File:Vpusillaskull.jpg', 'Fig. 37 on p. 125 in: Dogs, jackals, wolves and foxes', '1890')?.year).toBe(1890);
    expect(bookSource('File:Rotfuchsschädel.jpg', 'Own work', '2004-06-27')).toBeNull();
    expect(bookSource('File:Red fox skull (55367556835).jpg', 'Red fox skull', 'Taken on 20 June 2026, 11:48:10')).toBeNull();
    expect(bookSource('File:Vulpes vulpes 11zz.jpg', 'source: David Stang. First published at ZipcodeZoo.com', '2005-11-12')).toBeNull();
  });

  it('reconoce láminas por formato o por título', () => {
    expect(looksLikeDrawing('File:Redfoxpaws.png', 'image/png')).toBe(true);
    expect(looksLikeDrawing('File:Meyers b6 s0767 b1.jpg', 'image/jpeg')).toBe(true);
    expect(looksLikeDrawing('File:29-05-2021 Wandlitz toter Rotfuchs 08.jpg', 'image/jpeg')).toBe(false);
  });
});

describe('figuras de artículos (Biodiversity Literature Repository)', () => {
  const hit = (id: number, description: string, license = 'cc-by-4.0') => ({
    id,
    links: { self_html: `https://zenodo.org/records/${id}`, thumbnails: { '250': `https://z/${id}/250.jpg`, '1200': `https://z/${id}/1200.jpg` } },
    files: [{ key: 'figure.png' }],
    metadata: {
      title: `Fig. 1 in Novos registos de Lucanus cervus para Portugal`,
      description,
      publication_date: '2012-02-17',
      license: { id: license },
      creators: [{ name: 'Ferreira, Raul Nascimento' }],
      journal: { title: 'Arquivos Entomolóxicos' },
    },
  });

  it('el pie tiene que hablar de la especie al principio, con su nombre o abreviado', () => {
    expect(captionIsAbout('Figura 1.- Habitus de Lucanus cervus (Linnaeus, 1758).', 'Lucanus cervus')).toBe(true);
    expect(captionIsAbout('Fig. 4. Skull of B. bufo in ventral view', 'Bufo bufo')).toBe(true);
    expect(captionIsAbout('Fig. 2. Andrya rhopalocephala (Riehm, 1881) from Lepus europaeus Pallas.', 'Vulpes vulpes')).toBe(false);
  });

  it('acepta anatomía y rechaza mapas, gráficas, árboles y parásitos', () => {
    expect(isAnatomyCaption('Figure 3. The phallus morphology of Lepus europaeus in Turkey: A) dorsal, B) ventral, C) lateral view.')).toBe(true);
    expect(isAnatomyCaption('Fig. 1. Hyla arborea (European tree frog), dorsal view')).toBe(true);
    expect(isAnatomyCaption('FIGURE 56. Range map of Vulpes vulpes in Korea.')).toBe(false);
    expect(isAnatomyCaption('Figure 3. Bayesian Inference tree retrieved from the mitochondrial dataset, head of clade')).toBe(false);
    expect(isAnatomyCaption('Fig. 2. Andrya rhopalocephala from Lepus europaeus. A – mature proglottid, ventral')).toBe(false);
  });

  it('lee la figura con su artículo, autores, año y licencia, y descarta lo no libre', () => {
    const figs = parseZenodoFigures(
      [
        hit(1, 'Figura 1.- Habitus de Lucanus cervus (Linnaeus, 1758). a.- ♂ de Avelar; c.- ♀ de Avelar.'),
        hit(2, 'Figura 2.- Habitus de Lucanus cervus, vista dorsal.', 'notspecified'),
        hit(3, 'Fig. 3. Distribution map of Lucanus cervus in Portugal.'),
      ],
      'Lucanus cervus',
    );
    expect(figs).toHaveLength(1);
    expect(figs[0]).toMatchObject({
      title: 'zenodo:1',
      url: 'https://z/1/1200.jpg',
      thumb: 'https://z/1/250.jpg',
      kind: 'articulo',
      license: 'CC BY 4.0',
      author: 'Ferreira, Raul Nascimento',
      year: 2012,
      source: 'Novos registos de Lucanus cervus para Portugal · Arquivos Entomolóxicos',
    });
  });

  it('alterna libros y artículos sin repetir', () => {
    const m = (title: string) => ({ title }) as CommonsMedia;
    expect(interleave([m('a'), m('b'), m('c')], [m('x')], 3).map((x) => x.title)).toEqual(['a', 'x', 'b']);
  });
});

describe('archivos de Commons', () => {
  const page = (title: string, mime: string, extra: Record<string, unknown> = {}) => ({
    pageid: title.length,
    title,
    imageinfo: [
      {
        url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${title.slice(5)}?utm_source=x`,
        thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${title.slice(5)}/960px-${title.slice(5)}?utm_source=x`,
        width: 1000,
        height: 500,
        mime,
        descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
        extmetadata: {
          Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Erfil">Erfil</a>' },
          LicenseShortName: { value: 'CC BY-SA 3.0' },
          LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/3.0' },
          ...extra,
        },
      },
    ],
  });

  it('lee autoría, licencia y miniaturas sin parámetros de seguimiento', () => {
    const [m] = parseImagePages([page('File:Caminozorro.JPG', 'image/jpeg')]);
    expect(m.author).toBe('Erfil');
    expect(m.license).toBe('CC BY-SA 3.0');
    expect(m.url).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Caminozorro.JPG/960px-Caminozorro.JPG');
    expect(m.thumb).toContain('/330px-Caminozorro.JPG');
    expect(m.ratio).toBe(0.5);
    expect(m.drawing).toBe(false);
  });

  it('descarta lo no libre, lo que no es imagen y, si se pide, las fotos', () => {
    const pages = [
      page('File:Foto.jpg', 'image/jpeg'),
      page('File:Esquema.svg', 'image/svg+xml'),
      page('File:Spuren.pdf', 'application/pdf'),
      page('File:Logo.png', 'image/png', { NonFree: { value: 'true' } }),
    ];
    expect(parseImagePages(pages).map((m) => m.title)).toEqual(['File:Foto.jpg', 'File:Esquema.svg']);
    expect(parseImagePages(pages, { drawing: 'only' }).map((m) => m.title)).toEqual(['File:Esquema.svg']);
  });

  it('une sin repetir y pone los dibujos delante', () => {
    const m = (title: string, drawing: boolean) => ({ title, drawing }) as CommonsMedia;
    const merged = mergeMedia([[m('a', false), m('b', true)], [m('b', true), m('c', true)]], 3);
    expect(merged.map((x) => x.title)).toEqual(['b', 'c', 'a']);
  });

  it('texto plano de la autoría', () => {
    expect(stripHtml('<span>Oona R&amp;äisänen</span> (<a href="x">Mysid</a>)')).toBe('Oona R&äisänen ( Mysid )');
    expect(stripHtml('')).toBeNull();
  });
});

describe('sonidos que corresponden a la especie', () => {
  it('de Commons solo lo reproducible en el móvil (MP3 o su copia en MP3)', () => {
    const list = parseAudioPages([
      {
        pageid: 1,
        title: 'File:Turdus merula 2.ogg',
        videoinfo: [
          {
            url: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Turdus_merula_2.ogg?utm_source=x',
            mime: 'application/ogg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Turdus_merula_2.ogg',
            derivatives: [
              { src: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Turdus_merula_2.ogg', type: 'audio/ogg; codecs="vorbis"' },
              { src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/7/7c/Turdus_merula_2.ogg/Turdus_merula_2.ogg.mp3', type: 'audio/mpeg' },
            ],
            extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: 'Oona' } },
          },
        ],
      },
      { pageid: 2, title: 'File:Sin mp3.flac', videoinfo: [{ url: 'https://x/y.flac', mime: 'audio/x-flac', extmetadata: { LicenseShortName: { value: 'CC0' } } }] },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/transcoded/7/7c/Turdus_merula_2.ogg/Turdus_merula_2.ogg.mp3');
    const [s] = commonsToSounds(list);
    expect(s.source).toBe('commons');
    expect(s.obsUrl).toBe('https://commons.wikimedia.org/wiki/File:Turdus_merula_2.ogg');
  });

  it('de cada observación de iNaturalist solo el primer sonido, y Commons delante', () => {
    const obs: RawObservation = {
      id: 9,
      user: { login: 'ana' },
      sounds: [
        { id: 1, file_url: 'https://static.inaturalist.org/sounds/1.mp3', license_code: 'cc-by', attribution: '(c) ana, some rights reserved (CC BY)' },
        { id: 2, file_url: 'https://static.inaturalist.org/sounds/2.mp3', license_code: 'cc-by', attribution: '(c) ana, some rights reserved (CC BY)' },
      ],
    };
    const inat = parseSounds([obs]);
    expect(inat.map((s) => s.id)).toEqual([1]);
    const commons = commonsToSounds([{ id: 5, url: 'u', author: 'Ana', licenseLabel: 'CC0', licenseUrl: 'l', page: 'p' }]);
    // Mismo autor en las dos fuentes: no se repite.
    expect(mergeSounds(commons, inat).map((s) => s.source)).toEqual(['commons']);
  });
});

describe('cabecera de la app en lo remoto', () => {
  it('añade User-Agent a las URL remotas y deja lo local igual', () => {
    expect(withUserAgent('https://upload.wikimedia.org/x.jpg')).toEqual({
      uri: 'https://upload.wikimedia.org/x.jpg',
      headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Zarpa') }),
    });
    expect(withUserAgent('file:///data/x.jpg')).toBe('file:///data/x.jpg');
    expect(withUserAgent(null)).toBeNull();
    expect(withUserAgent(12)).toBe(12);
  });
});
