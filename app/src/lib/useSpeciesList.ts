import { useCallback, useEffect, useMemo, useState } from 'react';

import { countSpecies, listSpecies, type SpeciesRow } from '@/db/catalog';
import type { Filters, SortKey } from '@/db/query';
import { useJournal } from '@/store/journal';

const PAGE = 60;

type Page = { key: string; rows: SpeciesRow[]; total: number | null; done: boolean };

/**
 * Lista paginada del Bestiario sobre el catálogo SQLite.
 *
 * El estado va etiquetado con la consulta que lo produjo (`key`): si el usuario
 * teclea deprisa, la respuesta de una consulta vieja que llegue tarde no pisa
 * la nueva, y «cargando» es simplemente «lo que hay no es de esta consulta».
 * Mientras llega la nueva se sigue enseñando la anterior: sin parpadeos.
 */
export function useSpeciesList(filters: Filters, sort: SortKey) {
  const caught = useJournal((s) => s.caught);
  const saved = useJournal((s) => s.saved);
  const ctx = useMemo(() => ({ caughtIds: [...caught.keys()], savedIds: [...saved.keys()] }), [caught, saved]);
  // Las listas de capturadas/guardadas solo afectan a la consulta si se filtra
  // por ellas; así un fichaje no recarga un Bestiario que no las usa.
  const ctxKey = filters.caught !== 'any' || filters.saved ? `${caught.size}:${saved.size}` : '';

  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 180);
    return () => clearTimeout(t);
  }, [filters.q]);

  const effective = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);
  const key = JSON.stringify(effective) + sort + ctxKey;

  const [page, setPage] = useState<Page>({ key: '', rows: [], total: null, done: false });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([listSpecies(effective, ctx, sort, PAGE, 0), countSpecies(effective, ctx)]).then(([rows, total]) => {
      if (alive) setPage({ key, rows, total, done: rows.length < PAGE });
    });
    return () => {
      alive = false;
    };
    // `ctx` entra a través de `key` (ctxKey) para no recargar en cada fichaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loadMore = useCallback(() => {
    if (page.key !== key || page.done || loadingMore) return;
    setLoadingMore(true);
    listSpecies(effective, ctx, sort, PAGE, page.rows.length)
      .then((rows) => {
        // Si entretanto cambió la consulta, la página ya no es de esta lista.
        setPage((p) => (p.key === key ? { ...p, rows: [...p.rows, ...rows], done: rows.length < PAGE } : p));
      })
      .finally(() => setLoadingMore(false));
  }, [page, key, loadingMore, effective, ctx, sort]);

  return {
    rows: page.rows,
    total: page.key === key ? page.total : null,
    loading: page.key !== key || loadingMore,
    loadMore,
  };
}
