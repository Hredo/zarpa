import { create } from 'zustand';

import { EMPTY_FILTERS, type Filters, type SortKey } from '@/db/query';

type State = {
  filters: Filters;
  sort: SortKey;
  set: (patch: Partial<Filters>) => void;
  setSort: (sort: SortKey) => void;
  reset: () => void;
};

/** Filtros del Bestiario, compartidos con la hoja de filtros. */
export const useFilters = create<State>((set) => ({
  filters: EMPTY_FILTERS,
  sort: 'album',
  set: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  setSort: (sort) => set({ sort }),
  reset: () => set({ filters: EMPTY_FILTERS }),
}));
