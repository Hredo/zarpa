import {
  anatomyDetailCategories,
  categoryTitle,
  classifyCategories,
  mergeMedia,
  parseAudioPages,
  parseImagePages,
  type CommonsMedia,
  type CommonsSound,
  type Plates,
  type RawAudioPage,
  type RawImagePage,
} from './commons';
import { cachedJson } from './remote';

/*
 * Peticiones a Wikimedia Commons y Wikidata (ver `commons.ts`). Todo pasa por
 * la caché local de `remote.ts` (30 días): abrir otra vez una ficha no usa la
 * red, y sin conexión se ve lo que ya se bajó.
 */

const API = 'https://commons.wikimedia.org/w/api.php';
const DAYS = 30;
const MAX_TRACKS = 8;
const MAX_DRAWINGS = 10;

function qs(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function commons<T>(key: string, params: Record<string, string | number>): Promise<T | null> {
  const url = `${API}?${qs({ action: 'query', format: 'json', formatversion: 2, ...params })}`;
  const res = await cachedJson<T>(`commons:${key}`, url, DAYS);
  return res?.data ?? null;
}

async function subcategories(category: string): Promise<string[]> {
  const data = await commons<{ query?: { categorymembers?: { title: string }[] } }>(`sub:${category}`, {
    list: 'categorymembers',
    cmtitle: categoryTitle(category),
    cmtype: 'subcat',
    cmlimit: 500,
  });
  return data?.query?.categorymembers?.map((m) => m.title) ?? [];
}

const IMAGE_PROPS = {
  prop: 'imageinfo',
  iiprop: 'url|extmetadata|mime|size',
  iiurlwidth: 960,
  iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|NonFree',
};

async function filesIn(category: string, drawing: 'all' | 'only' | 'detect', limit = 40): Promise<CommonsMedia[]> {
  const data = await commons<{ query?: { pages?: RawImagePage[] } }>(`files:${category}:${limit}`, {
    generator: 'categorymembers',
    gcmtitle: categoryTitle(category),
    gcmtype: 'file',
    gcmlimit: limit,
    ...IMAGE_PROPS,
  });
  return parseImagePages(data?.query?.pages, { drawing });
}

/** Categoría de Commons de la especie según Wikidata (P373), por si no coincide con el nombre científico. */
async function wikidataCategory(qid: string): Promise<string | null> {
  const url = `https://www.wikidata.org/w/api.php?${qs({ action: 'wbgetclaims', format: 'json', entity: qid, property: 'P373' })}`;
  const res = await cachedJson<{ claims?: { P373?: { mainsnak?: { datavalue?: { value?: string } } }[] } }>(`wd:p373:${qid}`, url, DAYS);
  return res?.data.claims?.P373?.[0]?.mainsnak?.datavalue?.value ?? null;
}

/**
 * Huellas y láminas de una especie. `null` si no se pudo consultar (sin red y
 * sin copia guardada); listas vacías si Commons no tiene nada clasificado.
 */
export async function speciesPlates(sci: string, qid: string | null): Promise<Plates | null> {
  try {
    let subs = await subcategories(sci);
    if (subs.length === 0 && qid) {
      const alt = await wikidataCategory(qid);
      if (alt && alt !== sci) subs = await subcategories(alt);
    }
    const cats = classifyCategories(subs);
    // Dentro de «anatomía», las subcategorías de esqueleto, cráneo, huesos y dientes.
    const details = (await Promise.all(cats.anatomy.slice(0, 2).map(subcategories))).flat();
    const anatomyDetail = anatomyDetailCategories(details).slice(0, 3);

    const [tracks, anatomy, skeletal, drawings] = await Promise.all([
      Promise.all(cats.tracks.slice(0, 2).map((c) => filesIn(c, 'detect'))),
      // En «X anatomy» hay fotos de todo tipo: solo los dibujos.
      Promise.all(cats.anatomy.slice(0, 2).map((c) => filesIn(c, 'only'))),
      // Esqueletos y cráneos: láminas y piezas de museo, todo sirve para ver detalles.
      Promise.all(anatomyDetail.map((c) => filesIn(c, 'detect', 20))),
      // «X (illustrations)»: todo son ilustraciones.
      Promise.all(cats.drawings.slice(0, 2).map((c) => filesIn(c, 'all', 30))),
    ]);
    return {
      tracks: mergeMedia(tracks, MAX_TRACKS),
      drawings: mergeMedia([...anatomy, ...skeletal, ...drawings], MAX_DRAWINGS),
    };
  } catch {
    return null;
  }
}

/**
 * Grabaciones de referencia de la especie que Wikidata enlaza (P51, «audio»):
 * las elige y revisa la comunidad, así que corresponden a la especie.
 */
export async function speciesCommonsSounds(qid: string): Promise<CommonsSound[]> {
  try {
    const url = `https://www.wikidata.org/w/api.php?${qs({ action: 'wbgetclaims', format: 'json', entity: qid, property: 'P51' })}`;
    const res = await cachedJson<{ claims?: { P51?: { mainsnak?: { datavalue?: { value?: string } } }[] } }>(`wd:p51:${qid}`, url, DAYS);
    const files = (res?.data.claims?.P51 ?? [])
      .map((c) => c.mainsnak?.datavalue?.value)
      .filter((v): v is string => !!v)
      .slice(0, 4);
    if (files.length === 0) return [];
    const data = await commons<{ query?: { pages?: RawAudioPage[] } }>(`audio:${files.join('|')}`, {
      titles: files.map((f) => `File:${f}`).join('|'),
      prop: 'videoinfo',
      viprop: 'url|derivatives|extmetadata|mime|size',
      viextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|NonFree',
    });
    return parseAudioPages(data?.query?.pages);
  } catch {
    return [];
  }
}
