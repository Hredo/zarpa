import type { Scored } from './speciesIndex';

/*
 * De puntuaciones a una respuesta honesta.
 *
 * La regla del producto es «si no estás seguro, no lo afirmes». Aquí se traduce
 * así: las puntuaciones se convierten en probabilidades (softmax con la
 * temperatura calibrada) y se suman hacia arriba por la clasificación. La app
 * nombra el nivel más profundo cuya probabilidad acumulada supera el umbral de
 * ese nivel. Si la especie no llega, dice el género; si tampoco, la familia…
 * Nunca rellena un nivel por intuición.
 *
 * Los umbrales salen de `tools/zarpa_models/evaluate.py`: son los valores con los
 * que, en un banco de fotos verificadas que el modelo no vio, la respuesta
 * acierta al menos el 95 % de las veces en ese nivel.
 */

export const RANKS = ['class', 'order', 'family', 'genus', 'species'] as const;
export type Rank = (typeof RANKS)[number];

export type Lineage = { class: string | null; order: string | null; family: string | null; genus: string | null };

export type Thresholds = Record<Rank, number>;

/** Valores por defecto prudentes hasta que llegue la calibración del modelo. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  class: 0.9,
  order: 0.85,
  family: 0.8,
  genus: 0.8,
  species: 0.75,
};

export type Candidate = { id: number; p: number };

export type Verdict = {
  /** Nivel más profundo con certeza suficiente, o null si ni la clase lo es. */
  level: Rank | null;
  /** Nombre del taxón alcanzado en ese nivel (para especie, su id en `speciesId`). */
  taxon: string | null;
  speciesId: number | null;
  /** Probabilidad acumulada en cada nivel del mejor linaje. */
  ladder: Partial<Record<Rank, { name: string; p: number }>>;
  top: Candidate[];
};

export function softmax(scored: Scored[]): Candidate[] {
  if (scored.length === 0) return [];
  let max = -Infinity;
  for (const s of scored) if (s.logit > max) max = s.logit;
  let sum = 0;
  const exps = scored.map((s) => {
    const e = Math.exp(s.logit - max);
    sum += e;
    return e;
  });
  return scored.map((s, i) => ({ id: s.id, p: exps[i] / sum })).sort((a, b) => b.p - a.p);
}

/**
 * Decide qué se puede afirmar. `lineage(id)` da la clasificación de cada
 * especie candidata (viene del catálogo).
 */
export function decide(
  probs: Candidate[],
  lineage: (id: number) => Lineage | undefined,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Verdict {
  const top = probs.slice(0, 5);
  if (probs.length === 0) return { level: null, taxon: null, speciesId: null, ladder: {}, top };

  // El linaje se recorre de arriba abajo siguiendo siempre al mejor hijo del
  // nivel anterior: así la escalera nunca salta a una rama incoherente (una
  // familia que no pertenece al orden mostrado). En cada nivel se suma la
  // probabilidad de las especies que siguen en juego, agrupadas por taxón.
  const ladder: Verdict['ladder'] = {};
  let level: Rank | null = null;
  let taxon: string | null = null;
  let certain = true;
  let pool = probs;
  for (const rank of ['class', 'order', 'family', 'genus'] as const) {
    const totals = new Map<string, number>();
    for (const c of pool) {
      const name = lineage(c.id)?.[rank];
      if (name) totals.set(name, (totals.get(name) ?? 0) + c.p);
    }
    let bestName: string | null = null;
    let bestP = 0;
    for (const [name, p] of totals) {
      if (p > bestP) {
        bestName = name;
        bestP = p;
      }
    }
    if (!bestName) break;
    ladder[rank] = { name: bestName, p: bestP };
    // Un nivel solo se afirma si todos los de encima ya se afirmaron: nombrar
    // la familia sin estar seguro de la clase sería incoherente.
    if (certain && bestP >= thresholds[rank]) {
      level = rank;
      taxon = bestName;
    } else {
      certain = false;
    }
    pool = pool.filter((c) => lineage(c.id)?.[rank] === bestName);
  }

  const best = pool[0] ?? probs[0];
  ladder.species = { name: String(best.id), p: best.p };
  let speciesId: number | null = null;
  if (certain && level === 'genus' && best.p >= thresholds.species) {
    level = 'species';
    taxon = String(best.id);
    speciesId = best.id;
  }
  return { level, taxon, speciesId, ladder, top };
}

/**
 * Estabilidad en el visor: la especie solo se da por fijada si la misma
 * respuesta se repite en varias lecturas seguidas. Un fotograma movido puede
 * dar un 80 % a cualquier cosa; tres seguidos coincidiendo, no.
 */
export class Stabilizer {
  private history: (number | null)[] = [];
  constructor(private readonly needed = 3) {}

  push(speciesId: number | null): boolean {
    this.history.push(speciesId);
    if (this.history.length > this.needed) this.history.shift();
    return (
      this.history.length === this.needed && speciesId !== null && this.history.every((h) => h === speciesId)
    );
  }

  reset() {
    this.history = [];
  }
}
