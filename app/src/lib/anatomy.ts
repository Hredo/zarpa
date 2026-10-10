import type { CommonsMedia } from './commons';

/*
 * Láminas anatómicas de cada especie, sacadas de libros y artículos
 * científicos (nunca dibujadas ni generadas por la app):
 *
 * - Libros: láminas de obras escaneadas (Biodiversity Heritage Library,
 *   Internet Archive, bibliotecas digitales) que la comunidad de Wikimedia
 *   Commons ha clasificado en la anatomía, el esqueleto o el cráneo de la
 *   especie. Commons guarda en el campo «Credit» de dónde sale cada archivo
 *   («Plate III in: A monograph of the British Pleistocene Mammalia… 1909»):
 *   así se separan las láminas publicadas de las fotos que sube cada usuario.
 * - Artículos: figuras de artículos taxonómicos del Biodiversity Literature
 *   Repository (Plazi, en Zenodo), cada una con su pie de figura y su licencia.
 *   Solo se aceptan si el pie habla de esa especie desde el principio, describe
 *   anatomía (cráneo, vista dorsal, genitalia…) y no es un mapa, una gráfica o
 *   un árbol, y solo con licencias libres (CC BY, CC BY-SA, CC0).
 *
 * Este fichero es lógica pura para poder probarse en Jest; las peticiones
 * están en `anatomyRemote.ts`.
 */

export type PlateKind = 'libro' | 'articulo';

/* --- Libros (Commons) --------------------------------------------------------- */

/** Subcategorías de la especie que contienen anatomía (no huellas, no arte, no fotos del animal). */
const ANATOMY_CAT = /\b(anatomy|skeletons?|skulls?|crania|bones|osteology|dentition|teeth|morphology)\b/i;
const NOT_REFERENCE = /\b(in art|in heraldry|on stamps|stamps|coins|cartoons?|logos?|sculptures?|toys|statues?|paintings)\b/i;
const ANATOMY_SKIP = /\b(feces|faeces|scats?|droppings|tails|heads|eyes|juvenile|fur|feathers|claws|wings|tracks?|footprints?)\b/i;

export function anatomyCategories(titles: readonly string[]): string[] {
  return titles.filter((t) => ANATOMY_CAT.test(t) && !NOT_REFERENCE.test(t) && !ANATOMY_SKIP.test(t));
}

/** Foto propia subida por un usuario (lo contrario de una lámina publicada). */
const OWN_WORK = /\b(own work|photos?|photographs?|photographed|catalogue record|bundesarchiv|federal archives|500px|archive team|naturalis|self[- ]photographed|selbst fotografiert|eigenes werk|travail personnel|trabajo propio|obra propia|opera propria|eigen werk|photo(graph)? by|taken (on|with)|flickr)\b/i;
/** Huellas de una publicación en el campo «Credit» o en el título del archivo. */
const PUBLISHED = /\b(plates?|pl\.|fig\.|figs\.|figures?|figura|tafel|taf\.|planche|lámina|in:|monograph\w*|catalogue|catalog|journal|proceedings|transactions|bulletin|annals|annales|revue|zeitschrift|archiv|memoirs?|history of|natural history|naturgeschichte|histoire naturelle|iconograph\w*|description|vol\.|band|tome|p\.\s?\d+|biodiversitylibrary|biodiversity heritage|archive\.org|internet archive|digitalcollections|digital collections|bhl|doi)\b/i;
const YEAR = /\b(1[5-9]\d\d)\b/;

export type BookSource = { source: string; year: number | null };

/**
 * ¿Es una lámina de un libro o una revista? Se mira el campo «Credit» (de dónde
 * sale), la fecha y el título. Una foto propia («Own work», «Taken on…») nunca
 * cuenta; una obra fechada antes de 1990 o que cita lámina, figura o volumen, sí.
 */
export function bookSource(title: string, credit: string | null, date: string | null): BookSource | null {
  const c = credit ?? '';
  const d = date ?? '';
  if (OWN_WORK.test(c) || /taken on/i.test(d)) return null;
  const year = Number(YEAR.exec(d)?.[1] ?? YEAR.exec(c)?.[1] ?? /\((1[5-9]\d\d)\)/.exec(title)?.[1] ?? NaN);
  const old = Number.isFinite(year) && year < 1990;
  if (!old && !PUBLISHED.test(c) && !PUBLISHED.test(title)) return null;
  const source = cleanText(c, 160) ?? cleanText(title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''), 160);
  if (!source) return null;
  return { source, year: Number.isFinite(year) ? year : null };
}

/* --- Artículos (Biodiversity Literature Repository, Zenodo) -------------------- */

/** Vocabulario anatómico de los pies de figura (inglés, que es casi todo, y algo de español, francés, alemán y portugués). */
const ANAT =
  /\b(skulls?|crani(um|a|al)|mandibles?|jaws?|teeth|tooth|dentition|molars?|premolars?|incisors?|skeleton|skeletal|vertebra[el]?|bones?|humer(us|i)|femora?|femur|tibiae?|pelvis|scapula|habitus|dorsal|ventral|lateral|frontal|profile|head|pronotum|elytr(a|on)|antenna[el]?|wings?|venation|legs?|tars(us|i)|genitali[ac]|aedeagus|hemipen(is|es)|spermatheca|palps?|pedipalps?|chelicera[el]?|epigyn(e|um)|scales|scutellation|morpholog\w*|anatom\w*|drawings?|illustrations?|holotype|paratypes?|diagnostic|carapace|plastron|shell|fins?|otoliths?|beak|feet|foot|claws?|mouthparts|maxill\w*|sternum|tergites?|sternites?|cráneo|esqueleto|vista|crâne|squelette|schädel|skelett|crânio)\b/i;
/** Figuras que no muestran el cuerpo: mapas, gráficas, árboles, hábitat, parásitos… */
const NOT_ANATOMY =
  /\b(maps?|distribution|localit(y|ies)|habitats?|phylogen\w*|(phylogenetic|bayesian|consensus|ML|NJ|ultrametric) trees?|inference|mitochondrial|datasets?|lengths?|values|analys[ie]s|fits?|detection|automatic|modell?ing|statistic\w*|blood|cytochrome|gametocytes?|ovoids?|egg shapes?|dendrogram|cluster|PCA|principal components?|canonical|variates|scatter|biplot|graphs?|plots?|histograms?|regression|activity|camera.?traps?|sonograms?|spectrograms?|oscillograms?|calls?|songs?|networks?|DNA|sequences?|haplotypes?|karyotypes?|chromosomes?|study (area|site)s?|sampling|surveyed|ringing|abundance|densit(y|ies)|boxplots?|correlations?|seasonal|landscape|forest|stream|biomass|proportions?|measurements?|in situ|in nature|alive|predation|prey|feeding|regurgitat\w*|parasit\w*|hosts?|nematod\w*|cestod\w*|trematod\w*|sporocysts?|proglottids?|larvae? of|eggs? of|beekeeping|apiar\w*|hives?|traps?|mapa|distribución)\b/i;

const FREE_LICENSES: Record<string, string> = {
  'cc-by-4.0': 'CC BY 4.0',
  'cc-by-3.0': 'CC BY 3.0',
  'cc-by-2.0': 'CC BY 2.0',
  'cc-by-sa-4.0': 'CC BY-SA 4.0',
  'cc-by-sa-3.0': 'CC BY-SA 3.0',
  'cc-zero': 'CC0',
  'cc0-1.0': 'CC0',
};

const LICENSE_URL: Record<string, string> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
};

export type RawZenodoHit = {
  id: number | string;
  links?: { self_html?: string; thumbnails?: Record<string, string> };
  files?: { key: string }[];
  metadata?: {
    title?: string;
    description?: string;
    publication_date?: string;
    license?: { id?: string };
    creators?: { name?: string }[];
    journal?: { title?: string; volume?: string; pages?: string };
  };
};

/** El pie de figura habla de esta especie en sus primeras palabras («Fig. 3. Bufo bufo, cráneo…» o «B. bufo»). */
export function captionIsAbout(caption: string, sci: string): boolean {
  const [genus, epithet] = sci.trim().split(/\s+/);
  if (!genus || !epithet) return false;
  const head = caption.slice(0, 100);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(${esc(genus)}|${esc(genus[0])}\\.)\\s?${esc(epithet)}\\b`, 'i').test(head);
}

/** ¿El pie describe anatomía y no es un mapa, una gráfica o un parásito? */
export function isAnatomyCaption(caption: string): boolean {
  return ANAT.test(caption) && !NOT_ANATOMY.test(caption);
}

/** «Fig. 3 in Título del artículo» → «Título del artículo». */
function paperTitle(recordTitle: string): string {
  return recordTitle.replace(/^\s*(fig(ure|ura)?s?\.?|plate|tafel|рис\.?)\s*[\w\s,.–-]*?\s+(in|from):?\s+/i, '').trim();
}

/** Figuras anatómicas de la especie en una respuesta de búsqueda de Zenodo. */
export function parseZenodoFigures(hits: readonly RawZenodoHit[] | undefined, sci: string): CommonsMedia[] {
  const out: CommonsMedia[] = [];
  for (const h of hits ?? []) {
    const m = h.metadata;
    const license = FREE_LICENSES[m?.license?.id ?? ''];
    if (!m || !license) continue;
    const caption = cleanText(m.description, 600);
    if (!caption || !captionIsAbout(caption, sci) || !isAnatomyCaption(caption)) continue;
    const thumbs = h.links?.thumbnails ?? {};
    const key = h.files?.[0]?.key;
    const iiif = key ? `https://zenodo.org/api/iiif/record:${h.id}:${encodeURIComponent(key)}/full/%5E` : null;
    const url = thumbs['1200'] ?? (iiif ? `${iiif}1200,/0/default.jpg` : null);
    const thumb = thumbs['250'] ?? (iiif ? `${iiif}250,/0/default.jpg` : null);
    if (!url || !thumb) continue;
    const year = Number(/^(\d{4})/.exec(m.publication_date ?? '')?.[1] ?? NaN);
    const authors = (m.creators ?? []).map((c) => c.name).filter(Boolean) as string[];
    const author = authors.length === 0 ? null : authors.length === 1 ? authors[0] : `${authors[0]} et al.`;
    const journal = m.journal?.title ? cleanText(m.journal.title, 80) : null;
    const title = cleanText(paperTitle(m.title ?? ''), 160);
    out.push({
      title: `zenodo:${h.id}`,
      url,
      thumb,
      ratio: null,
      author,
      license,
      licenseUrl: LICENSE_URL[license] ?? null,
      page: h.links?.self_html ?? `https://zenodo.org/records/${h.id}`,
      drawing: true,
      kind: 'articulo',
      source: [title, journal].filter(Boolean).join(' · ') || null,
      caption,
      year: Number.isFinite(year) ? year : null,
    });
  }
  return out;
}

/* --- Común ---------------------------------------------------------------------- */

/** Texto plano de HTML, sin espacios de sobra y cortado a `max` caracteres. */
export function cleanText(html: string | null | undefined, max: number): string | null {
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
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Mismo archivo con otro recorte («… (cropped).jpg», «… cropped 1.png»). */
function sameFileKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/\s*\(?cropped[^)]*\)?/g, '')
    .trim();
}

/** Libros y artículos alternados (para que se vean los dos), sin repetir ni recortes del mismo archivo, hasta `max`. */
export function interleave(books: readonly CommonsMedia[], papers: readonly CommonsMedia[], max: number): CommonsMedia[] {
  const out: CommonsMedia[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < max && (i < books.length || i < papers.length); i++) {
    for (const m of [books[i], papers[i]]) {
      if (!m || out.length >= max) continue;
      const key = sameFileKey(m.title);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}
