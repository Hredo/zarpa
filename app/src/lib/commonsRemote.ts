import {
  categoryTitle,
  parseAudioPages,
  parseImagePages,
  type CommonsMedia,
  type CommonsSound,
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

export async function subcategories(category: string): Promise<string[]> {
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
  iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|NonFree|Credit|DateTimeOriginal',
};

/** Láminas publicadas (libros, revistas) de una categoría; las fotos propias se quedan fuera. */
export async function bookPlatesIn(category: string, limit = 40): Promise<CommonsMedia[]> {
  const data = await commons<{ query?: { pages?: RawImagePage[] } }>(`books:${category}:${limit}`, {
    generator: 'categorymembers',
    gcmtitle: categoryTitle(category),
    gcmtype: 'file',
    gcmlimit: limit,
    ...IMAGE_PROPS,
  });
  return parseImagePages(data?.query?.pages, { published: true });
}

/** Categoría de Commons de la especie según Wikidata (P373), por si no coincide con el nombre científico. */
export async function wikidataCategory(qid: string): Promise<string | null> {
  const url = `https://www.wikidata.org/w/api.php?${qs({ action: 'wbgetclaims', format: 'json', entity: qid, property: 'P373' })}`;
  const res = await cachedJson<{ claims?: { P373?: { mainsnak?: { datavalue?: { value?: string } } }[] } }>(`wd:p373:${qid}`, url, DAYS);
  return res?.data.claims?.P373?.[0]?.mainsnak?.datavalue?.value ?? null;
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
