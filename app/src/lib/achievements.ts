import { COUNTRIES, type Region } from './countries';
import { dayNumber } from './gameUtil';
import { GROUPS, type GroupCode } from './groups';
import { THREATENED } from './speciesMatch';

/*
 * Logros y medallas: lógica pura, sin React ni SQLite. Se calcula todo a partir
 * de un `StatsInput` (las especies distintas del cuaderno, las fechas de los
 * avistamientos y los países), así se prueba sin móvil. La lectura de las bases
 * está en `achievementsData.ts`.
 *
 * Cada medalla tiene tres niveles (bronce, plata, oro) con tres umbrales de una
 * misma cantidad. Se cuentan **especies distintas**, no avistamientos: ver el
 * mismo gorrión cien veces no da medalla de aves.
 */

export type Tier = 0 | 1 | 2 | 3;
export const TIER_NAME = ['', 'Bronce', 'Plata', 'Oro'] as const;

export type MedalFamily = 'total' | 'group' | 'rarity' | 'region' | 'country' | 'threatened' | 'streak';

export type Stats = {
  species: number;
  byGroup: Partial<Record<GroupCode, number>>;
  /** Especies de rareza ≥ 3 / ≥ 4 / = 5. */
  scarce: number;
  rare: number;
  legendary: number;
  threatened: number;
  critical: number;
  regions: number;
  countries: number;
  longestStreak: number;
  currentStreak: number;
};

export const EMPTY_STATS: Stats = {
  species: 0,
  byGroup: {},
  scarce: 0,
  rare: 0,
  legendary: 0,
  threatened: 0,
  critical: 0,
  regions: 0,
  countries: 0,
  longestStreak: 0,
  currentStreak: 0,
};

export type CaughtSpecies = { id: number; grp: string; rarity: number; iucn: string | null };

export type StatsInput = {
  species: CaughtSpecies[];
  /** `created_at` (ISO) de todos los avistamientos, para las rachas. */
  times: string[];
  /** Países (ISO) donde se ha avistado. */
  countries: string[];
  now?: Date;
};

const REGION_OF: Map<string, Region | null> = new Map(COUNTRIES.map((c) => [c.cc, c.region]));

/** Días seguidos: la racha más larga y la actual (viva si el último día es hoy o ayer). */
export function streaks(times: string[], now: Date = new Date()): { longest: number; current: number } {
  const days = [...new Set(times.map((t) => dayNumber(new Date(t))))].filter(Number.isFinite).sort((a, b) => a - b);
  if (!days.length) return { longest: 0, current: 0 };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  const today = dayNumber(now);
  const last = days[days.length - 1];
  const current = last >= today - 1 ? run : 0;
  return { longest, current };
}

export function computeStats(input: StatsInput): Stats {
  const byGroup: Partial<Record<GroupCode, number>> = {};
  let scarce = 0;
  let rare = 0;
  let legendary = 0;
  let threatened = 0;
  let critical = 0;
  for (const sp of input.species) {
    byGroup[sp.grp as GroupCode] = (byGroup[sp.grp as GroupCode] ?? 0) + 1;
    if (sp.rarity >= 3) scarce++;
    if (sp.rarity >= 4) rare++;
    if (sp.rarity >= 5) legendary++;
    if (sp.iucn && (THREATENED as readonly string[]).includes(sp.iucn)) threatened++;
    if (sp.iucn === 'CR') critical++;
  }
  const ccs = new Set(input.countries.map((c) => c.toUpperCase()));
  const regions = new Set<Region>();
  for (const cc of ccs) {
    const r = REGION_OF.get(cc);
    if (r) regions.add(r);
  }
  const s = streaks(input.times, input.now);
  return {
    species: input.species.length,
    byGroup,
    scarce,
    rare,
    legendary,
    threatened,
    critical,
    regions: regions.size,
    countries: ccs.size,
    longestStreak: s.longest,
    currentStreak: s.current,
  };
}

/* --- Catálogo de medallas ---------------------------------------------------- */

export type Thresholds = readonly [number, number, number];

/** Colores de acento de la medalla, resueltos con la paleta en el componente. */
export type MedalAccent = 'brand' | 'leaf' | 'sky' | 'sun' | 'red' | 'strong' | GroupCode;

export type MedalDef = {
  id: string;
  family: MedalFamily;
  title: string;
  accent: MedalAccent;
  thresholds: Thresholds;
  group?: GroupCode;
  /** Lo que mide, en la unidad de los umbrales. */
  value: (s: Stats) => number;
  /** Texto del objetivo para un número («Avista 10 aves distintas»). */
  goal: (n: number) => string;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

type GroupText = { title: string; first: string; many: string; distinct: string; thresholds: Thresholds };

const GROUP_TEXT: Record<GroupCode, GroupText> = {
  mamifero: { title: 'Rastro de pelo', first: 'tu primer mamífero', many: 'mamíferos', distinct: 'distintos', thresholds: [1, 10, 30] },
  ave: { title: 'Ojo de ave', first: 'tu primera ave', many: 'aves', distinct: 'distintas', thresholds: [1, 10, 50] },
  reptil: { title: 'Sangre fría', first: 'tu primer reptil', many: 'reptiles', distinct: 'distintos', thresholds: [1, 8, 25] },
  anfibio: { title: 'Salto al charco', first: 'tu primer anfibio', many: 'anfibios', distinct: 'distintos', thresholds: [1, 5, 15] },
  pez: { title: 'Aleta y escama', first: 'tu primer pez', many: 'peces', distinct: 'distintos', thresholds: [1, 8, 25] },
  insecto: { title: 'Seis patas', first: 'tu primer insecto', many: 'insectos', distinct: 'distintos', thresholds: [1, 10, 50] },
  aracnido: { title: 'Ocho patas', first: 'tu primer arácnido', many: 'arácnidos', distinct: 'distintos', thresholds: [1, 5, 15] },
  crustaceo: { title: 'Caparazón', first: 'tu primer crustáceo', many: 'crustáceos', distinct: 'distintos', thresholds: [1, 4, 12] },
  miriapodo: { title: 'Mil pies', first: 'tu primer ciempiés o milpiés', many: 'ciempiés y milpiés', distinct: 'distintos', thresholds: [1, 3, 8] },
  molusco: { title: 'Concha y baba', first: 'tu primer molusco', many: 'moluscos', distinct: 'distintos', thresholds: [1, 5, 15] },
  cnidario: { title: 'Deriva y tentáculo', first: 'tu primera medusa, coral o anémona', many: 'medusas, corales y anémonas', distinct: 'distintos', thresholds: [1, 3, 8] },
  equinodermo: { title: 'Cinco brazos', first: 'tu primera estrella o erizo de mar', many: 'estrellas y erizos de mar', distinct: 'distintos', thresholds: [1, 3, 8] },
  anelido: { title: 'Anillo a anillo', first: 'tu primer gusano anillado', many: 'gusanos anillados', distinct: 'distintos', thresholds: [1, 2, 5] },
  esponja: { title: 'Poro a poro', first: 'tu primera esponja', many: 'esponjas', distinct: 'distintas', thresholds: [1, 2, 5] },
  otro: { title: 'Bichos raros', first: 'tu primer invertebrado raro', many: 'invertebrados raros', distinct: 'distintos', thresholds: [1, 3, 8] },
};

const groupMedal = (code: GroupCode): MedalDef => {
  const t = GROUP_TEXT[code];
  return {
    id: `grupo-${code}`,
    family: 'group',
    title: t.title,
    accent: code,
    group: code,
    thresholds: t.thresholds,
    value: (s) => s.byGroup[code] ?? 0,
    goal: (n) => (n === 1 ? `Avista ${t.first}` : `Avista ${n} ${t.many} ${t.distinct}`),
  };
};

export const MEDALS: MedalDef[] = [
  {
    id: 'cuaderno',
    family: 'total',
    title: 'Naturalista',
    accent: 'brand',
    thresholds: [1, 25, 100],
    value: (s) => s.species,
    goal: (n) => (n === 1 ? 'Pega tu primer cromo' : `Pega ${n} especies distintas`),
  },
  ...GROUPS.map((g) => groupMedal(g.code)),
  {
    id: 'rareza-escasa',
    family: 'rarity',
    title: 'Buen ojo',
    accent: 'sun',
    thresholds: [1, 8, 30],
    value: (s) => s.scarce,
    goal: (n) => `Avista ${plural(n, 'especie escasa o más rara', 'especies escasas o más raras')}`,
  },
  {
    id: 'rareza-rara',
    family: 'rarity',
    title: 'Rareza',
    accent: 'red',
    thresholds: [1, 5, 15],
    value: (s) => s.rare,
    goal: (n) => `Avista ${plural(n, 'especie rara o legendaria', 'especies raras o legendarias')}`,
  },
  {
    id: 'rareza-legendaria',
    family: 'rarity',
    title: 'Leyenda',
    accent: 'sun',
    thresholds: [1, 3, 10],
    value: (s) => s.legendary,
    goal: (n) => `Avista ${plural(n, 'especie legendaria', 'especies legendarias')}`,
  },
  {
    id: 'continentes',
    family: 'region',
    title: 'Trotamundos',
    accent: 'sky',
    thresholds: [2, 4, 6],
    value: (s) => s.regions,
    goal: (n) => `Avista animales en ${n} regiones del mundo`,
  },
  {
    id: 'paises',
    family: 'country',
    title: 'Pasaporte',
    accent: 'sky',
    thresholds: [2, 5, 15],
    value: (s) => s.countries,
    goal: (n) => `Avista animales en ${n} países`,
  },
  {
    id: 'amenazadas',
    family: 'threatened',
    title: 'Guardián',
    accent: 'leaf',
    thresholds: [1, 5, 20],
    value: (s) => s.threatened,
    goal: (n) => `Avista ${plural(n, 'especie amenazada', 'especies amenazadas')} (vulnerable o peor)`,
  },
  {
    id: 'peligro-critico',
    family: 'threatened',
    title: 'Al filo',
    accent: 'red',
    thresholds: [1, 3, 8],
    value: (s) => s.critical,
    goal: (n) => `Avista ${plural(n, 'especie en peligro crítico', 'especies en peligro crítico')}`,
  },
  {
    id: 'racha',
    family: 'streak',
    title: 'Constancia',
    accent: 'brand',
    thresholds: [3, 7, 30],
    value: (s) => s.longestStreak,
    goal: (n) => `Avista algo ${n} días seguidos`,
  },
];

export const MEDAL_BY_ID: Record<string, MedalDef> = Object.fromEntries(MEDALS.map((m) => [m.id, m]));

/* --- Evaluación --------------------------------------------------------------- */

export type MedalState = {
  def: MedalDef;
  value: number;
  tier: Tier;
  /** Umbral del siguiente nivel; `null` con el oro ganado. */
  next: number | null;
  /** 0–1 hacia el siguiente nivel (desde el umbral anterior); 1 con el oro. */
  progress: number;
  /** Objetivo del siguiente nivel, o el del oro si ya lo tiene. */
  goal: string;
};

export function tierOf(value: number, t: Thresholds): Tier {
  return (value >= t[2] ? 3 : value >= t[1] ? 2 : value >= t[0] ? 1 : 0) as Tier;
}

export function evaluateMedal(def: MedalDef, stats: Stats): MedalState {
  const value = def.value(stats);
  const tier = tierOf(value, def.thresholds);
  const next = tier === 3 ? null : def.thresholds[tier];
  const prev = tier === 0 ? 0 : def.thresholds[tier - 1];
  const progress = next == null ? 1 : Math.max(0, Math.min(1, (value - prev) / (next - prev)));
  return { def, value, tier, next, progress, goal: def.goal(next ?? def.thresholds[2]) };
}

export function evaluateAll(stats: Stats): MedalState[] {
  return MEDALS.map((m) => evaluateMedal(m, stats));
}

export function unlockedCount(states: MedalState[]): number {
  return states.filter((s) => s.tier > 0).length;
}

/** Medallas con más nivel primero y, a igualdad, las más avanzadas hacia el siguiente. */
export function bestFirst(states: MedalState[]): MedalState[] {
  return states.slice().sort((a, b) => b.tier - a.tier || b.progress - a.progress);
}

/** Las que están más cerca de dar el siguiente nivel (para empujar al usuario). */
export function closestToNext(states: MedalState[], n: number): MedalState[] {
  return states
    .filter((s) => s.tier < 3)
    .sort((a, b) => b.progress - a.progress || a.def.id.localeCompare(b.def.id))
    .slice(0, n);
}

/* --- Desbloqueos ---------------------------------------------------------------- */

/** Mejor nivel ya celebrado de cada medalla (se guarda en AsyncStorage). */
export type SeenTiers = Record<string, number>;

export type Unlock = { id: string; tier: 1 | 2 | 3; state: MedalState };

/**
 * Niveles ganados que aún no se han celebrado. Si una medalla salta dos niveles
 * de golpe se celebra solo el más alto: dos pantallas seguidas por lo mismo
 * serían ruido.
 */
export function newUnlocks(states: MedalState[], seen: SeenTiers): Unlock[] {
  const out: Unlock[] = [];
  for (const s of states) {
    if (s.tier > (seen[s.def.id] ?? 0)) out.push({ id: s.def.id, tier: s.tier as 1 | 2 | 3, state: s });
  }
  return out.sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id));
}

export function markSeen(seen: SeenTiers, unlocks: Unlock[]): SeenTiers {
  const next = { ...seen };
  for (const u of unlocks) next[u.id] = Math.max(next[u.id] ?? 0, u.tier);
  return next;
}
