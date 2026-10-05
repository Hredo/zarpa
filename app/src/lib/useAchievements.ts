import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { catalog, journal } from '@/db';
import { useJournal } from '@/store/journal';

import {
  bestFirst,
  computeStats,
  evaluateAll,
  markSeen,
  newUnlocks,
  type MedalState,
  type SeenTiers,
  type Unlock,
} from './achievements';
import { loadStatsInput } from './achievementsData';

const SEEN_KEY = '@zarpa/logros/vistos/v1';

export async function readSeen(): Promise<SeenTiers | null> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenTiers) : null;
  } catch {
    return null;
  }
}

async function writeSeen(seen: SeenTiers): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Sin almacenamiento solo se repite la celebración la próxima vez.
  }
}

export type AchievementsView = {
  loading: boolean;
  states: MedalState[];
  /** Ordenadas: más nivel primero. */
  ranked: MedalState[];
  unlocked: number;
  total: number;
  /** Niveles ganados aún sin celebrar. Llama a `acknowledge` al mostrarlos. */
  pending: Unlock[];
  acknowledge: (unlocks: Unlock[]) => void;
};

/**
 * Medallas del usuario, recalculadas cada vez que el cuaderno cambia (un
 * fichaje nuevo, un borrado). La primera vez que se usa en un móvil que ya
 * tiene cuaderno, las medallas ya ganadas se celebran todas, de una en una.
 */
export function useAchievements(): AchievementsView {
  const caught = useJournal((s) => s.caught);
  const lastSightingAt = useJournal((s) => s.lastSightingAt);
  const [states, setStates] = useState<MedalState[]>([]);
  const [pending, setPending] = useState<Unlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const input = await loadStatsInput(journal(), catalog());
      const evaluated = evaluateAll(computeStats(input));
      const seen = (await readSeen()) ?? {};
      if (!alive) return;
      setStates(evaluated);
      setPending(newUnlocks(evaluated, seen));
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [caught, lastSightingAt]);

  const acknowledge = useCallback((unlocks: Unlock[]) => {
    setPending((p) => p.filter((u) => !unlocks.some((x) => x.id === u.id && x.tier >= u.tier)));
    readSeen().then((seen) => writeSeen(markSeen(seen ?? {}, unlocks)));
  }, []);

  return {
    loading,
    states,
    ranked: bestFirst(states),
    unlocked: states.filter((s) => s.tier > 0).length,
    total: states.length,
    pending,
    acknowledge,
  };
}
