/*
 * Wikimedia Commons: huellas, láminas anatómicas y grabaciones de cada especie.
 *
 * Commons ordena sus archivos en categorías que la comunidad mantiene a mano y
 * con nombres estables bajo la de cada especie («Vulpes vulpes tracks»,
 * «Vulpes vulpes anatomy», «Sus scrofa (illustrations)»). Es la fuente que
 * usa la app: lo que está en esas categorías lo ha clasificado una persona, no
 * una búsqueda por palabras. Todo Commons es contenido libre (también para uso
 * comercial); aun así se descarta lo marcado como no libre y siempre se
 * muestran autor y licencia con enlace al original.
 *
 * Aquí solo está la lógica pura (qué categoría es qué, qué archivo es un
 * dibujo, cómo se lee la autoría); las peticiones están en `commonsRemote.ts`.
 */

export type CommonsMedia = {
  /** «File:Fuchs Fährte.jpg» */
  title: string;
  /** Imagen para la vista grande (miniatura de 960 px o el original si es menor). */
  url: string;
  /** Miniatura para las filas (330 px, ancho estándar de Wikimedia). */
  thumb: string;
  /** alto / ancho, si se conoce. */
  ratio: number | null;
  author: string | null;
  license: string;
  licenseUrl: string | null;
  /** Página del archivo en Commons (autoría completa y original). */
  page: string;
  /** Dibujo, lámina o esquema (no fotografía). */
  drawing: boolean;
};

export type Plates = {
  /** Huellas y rastros. */
  tracks: CommonsMedia[];
  /** Láminas: dibujos anatómicos (esqueleto, cráneo, órganos) y del animal entero. */
  drawings: CommonsMedia[];
};

export type PlateCategories = { tracks: string[]; anatomy: string[]; drawings: string[] };

const TRACKS = /\b(tracks?|footprints?|foot prints?|pawprints?|paw prints?|spoors?|trackways?|trails? in snow)\b/i;
const ANATOMY = /\b(anatomy|skeletons?|skulls?|crania|bones|osteology|dentition|teeth)\b/i;
const DRAWINGS = /\((illustrations|drawings)\)|\b(illustrations|drawings|line art|scientific illustrations?|plates)\b/i;
/** Arte, sellos, heráldica…: representaciones, no material para identificar. */
const NOT_REFERENCE = /\b(in art|in heraldry|on stamps|stamps|coins|cartoons?|logos?|sculptures?|toys|statues?|paintings)\b/i;
/** Dentro de «anatomía», lo que no son láminas (fotos de heces, colas, cabezas vivas). */
const ANATOMY_SKIP = /\b(feces|faeces|scats?|droppings|tails|heads|eyes|juvenile|fur|feathers|claws|wings)\b/i;

/** Clasifica las subcategorías de la categoría de una especie. */
export function classifyCategories(titles: readonly string[]): PlateCategories {
  const out: PlateCategories = { tracks: [], anatomy: [], drawings: [] };
  for (const t of titles) {
    if (NOT_REFERENCE.test(t)) continue;
    if (TRACKS.test(t)) out.tracks.push(t);
    else if (ANATOMY.test(t) && !ANATOMY_SKIP.test(t)) out.anatomy.push(t);
    else if (DRAWINGS.test(t)) out.drawings.push(t);
  }
  return out;
}

/** Subcategorías de «X anatomy» que son láminas (huesos, cráneo, esqueleto), no fotos sueltas. */
export function anatomyDetailCategories(titles: readonly string[]): string[] {
  return titles.filter((t) => /\b(skeletons?|skulls?|crania|bones|osteology|dentition|teeth)\b/i.test(t) && !NOT_REFERENCE.test(t));
}

const DRAWING_TITLE =
  /(tafel|plate|planche|l[áa]mina|\bpl\.|\bfig\.?|figure|illustrat|drawing|zeichnung|dessin|dibujo|engraving|gravure|lithograph|woodcut|holzschnitt|sketch|diagram|schema|scheme|anatom|skelet|skull|sch[äa]del|cr[áa]neo|\bcr[âa]ne|EB1911|Meyers|Brehm|Naumann|Cuvier|Wellcome|Gould|Audubon|Buffon|Lydekker|Biodiversity Heritage|\bBHL\b|Trittsiegel|Spurenbild)/i;
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

/** Archivos de imagen de una respuesta `prop=imageinfo` (solo imágenes libres). `drawingOnly`: solo dibujos. */
export function parseImagePages(pages: readonly RawImagePage[] | undefined, opts: { drawing?: 'all' | 'only' | 'detect' } = {}): CommonsMedia[] {
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
