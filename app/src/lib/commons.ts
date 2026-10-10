import { bookSource, type PlateKind } from './anatomy';

/*
 * Wikimedia Commons: láminas anatómicas de libros escaneados (ver `anatomy.ts`)
 * y grabaciones de cada especie.
 *
 * Commons ordena sus archivos en categorías que la comunidad mantiene a mano y
 * con nombres estables bajo la de cada especie («Vulpes vulpes skulls»,
 * «Rana temporaria anatomy»). Lo que está en esas categorías lo ha clasificado
 * una persona, no una búsqueda por palabras. Se descarta lo marcado como no
 * libre y siempre se muestran autor, fuente y licencia con enlace al original.
 *
 * Aquí solo está la lógica pura; las peticiones están en `commonsRemote.ts` y
 * `anatomyRemote.ts`.
 */

export type CommonsMedia = {
  /** «File:Fuchs Schädel.jpg» o «zenodo:12644122»: identifica el archivo. */
  title: string;
  /** Imagen para la vista grande (miniatura de 960–1200 px o el original si es menor). */
  url: string;
  /** Miniatura para las filas. */
  thumb: string;
  /** alto / ancho, si se conoce. */
  ratio: number | null;
  author: string | null;
  license: string;
  licenseUrl: string | null;
  /** Página del original (Commons o Zenodo) con la autoría completa. */
  page: string;
  /** Dibujo, lámina o esquema (no fotografía). */
  drawing: boolean;
  /** De dónde sale la lámina: un libro escaneado o un artículo científico. */
  kind?: PlateKind;
  /** Obra de la que sale («A monograph of the Canidae (1890)», título del artículo y revista). */
  source?: string | null;
  /** Pie de figura original del artículo. */
  caption?: string | null;
  year?: number | null;
};

const DRAWING_TITLE =
  /(tafel|plate|planche|l[áa]mina|\bpl\.|\bfig\.?|figure|illustrat|drawing|zeichnung|dessin|dibujo|engraving|gravure|lithograph|woodcut|holzschnitt|sketch|diagram|schema|scheme|anatom|skelet|skull|sch[äa]del|cr[áa]neo|\bcr[âa]ne|EB1911|Meyers|Brehm|Naumann|Cuvier|Wellcome|Gould|Audubon|Buffon|Lydekker|Biodiversity Heritage|\bBHL\b)/i;
const DRAWING_MIME = /^image\/(svg\+xml|png|gif|tiff)$/i;

/** ¿Es un dibujo o lámina? Por el formato (SVG, PNG…) o por el título (lámina, figura, autor de láminas clásico). */
export function looksLikeDrawing(title: string, mime: string | null | undefined): boolean {
  return DRAWING_MIME.test(mime ?? '') || DRAWING_TITLE.test(title);
}

/** Texto plano de los campos HTML de Commons («<a href=…>Erfil</a>» → «Erfil»). */
export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/** Quita los parámetros de seguimiento que añade la API (utm_*). */
export function cleanUrl(url: string): string {
  return url.split('?')[0];
}

type ExtMeta = Record<string, { value?: string | number | boolean } | undefined>;

export type RawImagePage = {
  pageid?: number;
  title: string;
  missing?: boolean;
  imageinfo?: {
    url?: string;
    thumburl?: string;
    width?: number;
    height?: number;
    mime?: string;
    descriptionurl?: string;
    extmetadata?: ExtMeta;
  }[];
};

function metaString(m: ExtMeta | undefined, key: string): string | null {
  const v = m?.[key]?.value;
  return v == null ? null : String(v);
}

function isNonFree(m: ExtMeta | undefined): boolean {
  const v = metaString(m, 'NonFree');
  return v != null && v !== '' && v !== 'false';
}

/**
 * Archivos de imagen de una respuesta `prop=imageinfo` (solo imágenes libres).
 * `drawing: 'only'` deja solo dibujos; `published: true`, solo láminas de libros
 * y revistas (no fotos propias), con su obra de origen.
 */
export function parseImagePages(
  pages: readonly RawImagePage[] | undefined,
  opts: { drawing?: 'all' | 'only' | 'detect'; published?: boolean } = {},
): CommonsMedia[] {
  const mode = opts.drawing ?? 'detect';
  const out: CommonsMedia[] = [];
  for (const p of pages ?? []) {
    const ii = p.imageinfo?.[0];
    if (p.missing || !ii?.url) continue;
    const mime = ii.mime ?? '';
    if (!mime.startsWith('image/')) continue;
    const meta = ii.extmetadata;
    if (isNonFree(meta)) continue;
    const license = metaString(meta, 'LicenseShortName');
    if (!license) continue;
    const drawing = mode === 'all' ? true : looksLikeDrawing(p.title, mime);
    if (mode === 'only' && !drawing) continue;
    const book = opts.published ? bookSource(p.title, metaString(meta, 'Credit'), metaString(meta, 'DateTimeOriginal')) : null;
    if (opts.published && !book) continue;
    const url = cleanUrl(ii.thumburl ?? ii.url);
    out.push({
      title: p.title,
      url,
      thumb: url.replace('/960px-', '/330px-'),
      ratio: ii.width && ii.height ? ii.height / ii.width : null,
      author: stripHtml(metaString(meta, 'Artist')),
      license,
      licenseUrl: metaString(meta, 'LicenseUrl'),
      page: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      drawing,
      ...(book ? { kind: 'libro' as const, source: book.source, year: book.year } : null),
    });
  }
  return out;
}

/** Une listas sin repetir archivo, dibujos primero, hasta `max`. */
export function mergeMedia(lists: readonly CommonsMedia[][], max: number, drawingsFirst = true): CommonsMedia[] {
  const seen = new Set<string>();
  const all: CommonsMedia[] = [];
  for (const l of lists) {
    for (const m of l) {
      if (seen.has(m.title)) continue;
      seen.add(m.title);
      all.push(m);
    }
  }
  const sorted = drawingsFirst ? [...all.filter((m) => m.drawing), ...all.filter((m) => !m.drawing)] : all;
  return sorted.slice(0, max);
}

/* --- Sonido -------------------------------------------------------------- */

export type RawAudioPage = {
  pageid?: number;
  title: string;
  missing?: boolean;
  videoinfo?: {
    url?: string;
    mime?: string;
    size?: number;
    descriptionurl?: string;
    derivatives?: { src: string; type?: string }[];
    extmetadata?: ExtMeta;
  }[];
};

export type CommonsSound = {
  id: number;
  url: string;
  author: string;
  licenseLabel: string;
  licenseUrl: string;
  page: string;
};

/**
 * Grabaciones de Commons que se pueden reproducir en iOS y Android: la copia
 * MP3 que genera Commons para los OGG/FLAC, o el propio archivo si ya es MP3.
 */
export function parseAudioPages(pages: readonly RawAudioPage[] | undefined): CommonsSound[] {
  const out: CommonsSound[] = [];
  for (const p of pages ?? []) {
    const vi = p.videoinfo?.[0];
    if (p.missing || !vi?.url) continue;
    const meta = vi.extmetadata;
    if (isNonFree(meta)) continue;
    const license = metaString(meta, 'LicenseShortName');
    if (!license) continue;
    const mp3 = vi.mime === 'audio/mpeg' ? vi.url : vi.derivatives?.find((d) => d.type === 'audio/mpeg')?.src;
    if (!mp3) continue;
    const page = vi.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`;
    out.push({
      id: p.pageid ?? hash(p.title),
      url: cleanUrl(mp3).replace(/^http:/, 'https:'),
      author: stripHtml(metaString(meta, 'Artist')) ?? 'Wikimedia Commons',
      licenseLabel: license,
      licenseUrl: metaString(meta, 'LicenseUrl') ?? page,
      page,
    });
  }
  return out;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** «Category:Vulpes vulpes» para la API («Category:Vulpes_vulpes» no hace falta). */
export function categoryTitle(name: string): string {
  const n = name.trim();
  return n.startsWith('Category:') ? n : `Category:${n}`;
}
