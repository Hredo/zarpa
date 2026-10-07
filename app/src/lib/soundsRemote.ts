import { speciesCommonsSounds } from './commonsRemote';
import { cachedJson, type Fetched } from './remote';
import { commonsToSounds, mergeSounds, parseSounds, SOUND_LICENSES, type RawObservation, type Sound } from './sounds';

/**
 * Sonidos de la especie: los de referencia de Commons (si la especie tiene
 * ficha en Wikidata) y los de observaciones de iNaturalist identificadas por
 * el sonido (`photos=false`: sin foto, la comunidad la identificó escuchando).
 * Ver `sounds.ts`. Reutiliza la caché local de `remote.ts`.
 */
export async function speciesSounds(taxonId: number, qid: string | null): Promise<Fetched<Sound[]> | null> {
  const url =
    `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}&quality_grade=research` +
    `&sounds=true&photos=false&sound_license=${SOUND_LICENSES}&captive=false&order_by=votes&per_page=20&locale=es`;
  const [res, commons] = await Promise.all([
    // taxonId 0: grupo que no suele sonar; solo se mira Commons.
    taxonId > 0 ? cachedJson<{ results: RawObservation[] }>(`sounds3:${taxonId}`, url, 30) : Promise.resolve(null),
    qid ? speciesCommonsSounds(qid) : Promise.resolve([]),
  ]);
  const inat = res ? parseSounds(res.data.results, 4) : [];
  const data = mergeSounds(commonsToSounds(commons), inat);
  if (!res && data.length === 0) return taxonId > 0 ? null : { data, fetchedAt: new Date().toISOString(), fromCache: false };
  return { data, fetchedAt: res?.fetchedAt ?? new Date().toISOString(), fromCache: res?.fromCache ?? false };
}
