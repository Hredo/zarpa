import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type State = {
  /** Ficha sencilla para niños: frases cortas, letra e iconos grandes, sin bloques técnicos. */
  kidsMode: boolean;
  setKidsMode: (on: boolean) => void;
  toggleKidsMode: () => void;
  /** Avisos en segundo plano de rarezas cerca (lib/rarityAlerts.ts). */
  rarityAlerts: boolean;
  setRarityAlerts: (on: boolean) => void;
};

/**
 * Ajustes de la app, guardados en el móvil (AsyncStorage).
 * El interruptor definitivo vive en el perfil; la ficha lleva uno provisional («Aa»).
 *
 * API: `const kids = useSettings((s) => s.kidsMode)` · `useSettings.getState().setKidsMode(true)`
 */
export const useSettings = create<State>()(
  persist(
    (set) => ({
      kidsMode: false,
      setKidsMode: (on) => set({ kidsMode: on }),
      toggleKidsMode: () => set((s) => ({ kidsMode: !s.kidsMode })),
      rarityAlerts: false,
      setRarityAlerts: (on) => set({ rarityAlerts: on }),
    }),
    {
      name: 'zarpa-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ kidsMode: s.kidsMode, rarityAlerts: s.rarityAlerts }),
    },
  ),
);
