import { useEffect, useMemo, useState } from 'react';

import { catalog, journal } from '@/db';
import { ensureCountries } from '@/db/catalogDetail';
import { useJournal } from '@/store/journal';

import { dayKey, monthRange } from './gameUtil';
import { useLastLocation, useUserCountry } from './location';
import {
  missionProgress,
  seasonalMissions,
  seasonOf,
  suggestSpecies,
  weeklyMissions,
  type Mission,
  type Progress,
  type Season,
  type SightingLite,
  type SuggestedSpecies,
} from './missions';
import { loadSpeciesMeta, type SpeciesMeta } from './speciesMatch';

export type MissionState = Mission & { progress: Progress; suggestions: SuggestedSpecies[] };

export type MissionsView = {
  loading: boolean;
  weekly: MissionState[];
  seasonal: MissionState[];
  season: Season;
  /** False mientras no hay ubicación: se asume el hemisferio norte. */
  hemisphereKnown: boolean;
  hasCountry: boolean;
  completed: number;
  total: number;
};

const suggestionCache = new Map<string, SuggestedSpecies[]>();

/**
 * Retos de la semana y de la temporada con su avance, recalculado cuando el
 * cuaderno cambia. Una sola lectura de avistamientos desde el inicio del mes
 * (que siempre cubre la semana en curso salvo a caballo de dos meses, por eso
 * se pide desde el inicio más antiguo de los dos periodos).
 */
export function useMissions(): MissionsView {
  const coords = useLastLocation();
  const cc = useUserCountry();
  const lat = coords?.lat ?? null;
  const lastSightingAt = useJournal((s) => s.lastSightingAt);
  const caught = useJournal((s) => s.caught);

  const today = dayKey();
  const { weeklyDefs, seasonalDefs, season } = useMemo(() => {
    const now = new Date();
    return { weeklyDefs: weeklyMissions(now), seasonalDefs: seasonalMissions(now, lat), season: seasonOf(now.getMonth(), lat) };
    // Las misiones cambian con el día (`today`) y con el hemisferio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, today]);

  const [state, setState] = useState<{ weekly: MissionState[]; seasonal: MissionState[] } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const defs = [...weeklyDefs, ...seasonalDefs];
      const from = defs.reduce((min, m) => (m.from < min ? m.from : min), defs[0].from);
      const sightings = await journal().getAllAsync<SightingLite>(
        'SELECT species_id, created_at FROM sighting WHERE created_at >= ?',
        [from],
      );
      const ids = [...new Set(sightings.map((s) => s.species_id).filter((x): x is number => x != null))];
      const meta: Map<number, SpeciesMeta> = await loadSpeciesMeta(catalog(), ids);
      const month = monthRange().id;
      const withState = async (m: Mission): Promise<MissionState> => {
        let suggestions: SuggestedSpecies[] = [];
        if (m.scope === 'temporada' && cc) {
          const key = `${cc}:${m.id}`;
          const cached = suggestionCache.get(key);
          if (cached) suggestions = cached;
          // Sin la lista del país (sin red la primera vez) no hay sugerencias, y no se recuerda el vacío.
          else if (await ensureCountries([cc])) {
            suggestions = await suggestSpecies(catalog(), m, cc, `${month}:${cc}`);
            suggestionCache.set(key, suggestions);
          }
        }
        return { ...m, progress: missionProgress(m, sightings, meta), suggestions };
      };
      const weekly = await Promise.all(weeklyDefs.map(withState));
      const seasonal = await Promise.all(seasonalDefs.map(withState));
      if (alive) setState({ weekly, seasonal });
    })().catch(() => alive && setState({ weekly: [], seasonal: [] }));
    return () => {
      alive = false;
    };
  }, [weeklyDefs, seasonalDefs, cc, lastSightingAt, caught]);

  const all = [...(state?.weekly ?? []), ...(state?.seasonal ?? [])];
  return {
    loading: state == null,
    weekly: state?.weekly ?? [],
    seasonal: state?.seasonal ?? [],
    season,
    hemisphereKnown: lat != null,
    hasCountry: cc != null,
    completed: all.filter((m) => m.progress.done).length,
    total: all.length,
  };
}
