import { anatomyCategories, interleave, parseZenodoFigures, type RawZenodoHit } from './anatomy';
import type { CommonsMedia } from './commons';
import { bookPlatesIn, subcategories, wikidataCategory } from './commonsRemote';
import { cachedJson } from './remote';

/*
 * Peticiones de las láminas anatómicas (ver `anatomy.ts`). Todo pasa por la
 * caché local de `remote.ts` (30 días): abrir otra vez una ficha no usa la red
 * y sin conexión se ve lo que ya se bajó.
 */

const DAYS = 30;
const MAX_PLATES = 12;

/** Láminas de libros: anatomía, esqueleto y cráneo de la especie en Commons (y un nivel por debajo). */
async function bookPlates(sci: string, qid: string | null): Promise<CommonsMedia[]> {
  let subs = await subcategories(sci);
  if (subs.length === 0 && qid) {
    const alt = await wikidataCategory(qid);
    if (alt && alt !== sci) subs = await subcategories(alt);
  }
  const top = anatomyCategories(subs).slice(0, 3);
  // «X anatomy» suele repartirse en «X skulls», «X skeletons»…
  const nested = anatomyCategories((await Promise.all(top.map(subcategories))).flat()).slice(0, 4);
  const lists = await Promise.all([...top, ...nested].map((c) => bookPlatesIn(c, 40)));
  const seen = new Set<string>();
  return lists.flat().filter((m) => !seen.has(m.title) && !!seen.add(m.title));
}

/** Figuras de artículos taxonómicos del Biodiversity Literature Repository (Plazi) en Zenodo. */
async function paperFigures(sci: string): Promise<CommonsMedia[]> {
  const q = `"${sci}"`;
  const url = `https://zenodo.org/api/records?communities=biosyslit&type=image&size=25&q=${encodeURIComponent(q)}`;
  const res = await cachedJson<{ hits?: { hits?: RawZenodoHit[] } }>(`zenodo:fig:${sci}`, url, DAYS);
  return parseZenodoFigures(res?.data.hits?.hits, sci);
}

/**
 * Láminas anatómicas de una especie, de libros y de artículos. `null` si no se
 * pudo consultar nada (sin red y sin copia guardada); lista vacía si ninguna
 * fuente tiene láminas de esta especie.
 */
export async function speciesAnatomy(sci: string, qid: string | null): Promise<CommonsMedia[] | null> {
  const [books, papers] = await Promise.all([
    bookPlates(sci, qid).catch(() => null),
    paperFigures(sci).catch(() => null),
  ]);
  if (books === null && papers === null) return null;
  return interleave(books ?? [], papers ?? [], MAX_PLATES);
}
