import { cachedJson, type Fetched } from './remote';
import { parseSounds, type RawObservation, type Sound } from './sounds';

/**
 * Sonidos con licencia CC de observaciones de grado investigación del taxón,
 * las mejor votadas primero. Reutiliza la caché local de `remote.ts`.
 */
export async function speciesSounds(taxonId: number): Promise<Fetched<Sound[]> | null> {
  const url =
    `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}&quality_grade=research` +
    `&sounds=true&sound_license=any&captive=false&order_by=votes&per_page=15&locale=es`;
  const res = await cachedJson<{ results: RawObservation[] }>(`sounds:${taxonId}`, url, 30);
  if (!res) return null;
  return { ...res, data: parseSounds(res.data.results) };
}
