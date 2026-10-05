import { useEffect, useState } from 'react';

import { catalog } from '@/db';
import { LIST_COLUMNS, type SpeciesRow } from '@/db/query';

/*
 * Especie del día: la misma para todo el mundo durante veinticuatro horas.
 * Se elige entre las que tienen nombre en español y foto, y se han visto lo
 * bastante como para que sean un buen descubrimiento (no un bicho sin rastro).
 * El día natural (local) fija la posición; sin azar, así no cambia al reabrir.
 */
const WHERE = 'img IS NOT NULL AND name_es IS NOT NULL AND rg_obs >= 300';

/**
 * Tamaño de la reserva de candidatas: las 3000 más observadas que cumplen
 * `WHERE`. Recorrer el índice `species_obs` en orden y saltar `OFFSET` filas
 * cuesta unos milisegundos; contar las ~7500 candidatas con COUNT(*) o
 * ordenar por `id` obligaba a leer todas (≈150 ms en un PC, más en un móvil)
 * sobre una tabla de 266 000 filas. La vista `species_v` solo se une (tres
 * LEFT JOIN) para la fila elegida.
 */
const POOL = 3000;

let cache: { day: number; row: SpeciesRow | null } | null = null;

function dayNumber(d = new Date()): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
}

export async function speciesOfTheDay(d = new Date()): Promise<SpeciesRow | null> {
  const day = dayNumber(d);
  if (cache?.day === day) return cache.row;
  const db = catalog();
  // Multiplicador primo grande: días seguidos no dan especies vecinas del álbum.
  const pick = async (offset: number) =>
    db.getFirstAsync<{ id: number }>(`SELECT id FROM species WHERE ${WHERE} ORDER BY rg_obs DESC, id LIMIT 1 OFFSET ?`, [offset]);
  const hit = (await pick((day * 7919) % POOL)) ?? (await pick(0));
  const row = hit
    ? await db.getFirstAsync<SpeciesRow>(`SELECT ${LIST_COLUMNS} FROM species_v s WHERE s.id = ?`, [hit.id])
    : null;
  cache = { day, row };
  return row;
}

export function useSpeciesOfTheDay(): SpeciesRow | null {
  const [sp, setSp] = useState<SpeciesRow | null>(null);
  useEffect(() => {
    let alive = true;
    speciesOfTheDay()
      .then((r) => alive && setSp(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return sp;
}
