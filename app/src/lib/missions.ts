import type { IconName } from '@/components/Icon';

import { dayKey, hash32, isoWeek, monthRange, rng, shuffled } from './gameUtil';
import type { GroupCode } from './groups';
import { expandUrl } from './urls';
import { THREATENED, matcherSql, matches, type Matcher, type Reader, type SpeciesMeta } from './speciesMatch';

/*
 * Misiones y retos. Todo es función de la fecha (y del hemisferio para los de
 * temporada): sin servidor, sin azar real, igual en cualquier móvil. El avance
 * se calcula siempre de los avistamientos del cuaderno dentro del periodo, así
 * que no hay nada que guardar ni que sincronizar.
 *
 *   - Semanales: tres retos (fácil, medio, difícil) por semana ISO.
 *   - De temporada: dos retos por mes según la estación del hemisferio.
 *
 * Recompensa visual: un sello de bronce, plata u oro que se estampa en la
 * tarjeta al cumplir el reto.
 */

export type MissionScope = 'semana' | 'temporada';
export type MissionKind = 'especies' | 'dias' | 'grupo' | 'ambiente' | 'polinizador' | 'rareza' | 'amenazada' | 'migradora';

export type Reward = { tier: 1 | 2 | 3; stamp: string };

export type Mission = {
  id: string;
  scope: MissionScope;
  kind: MissionKind;
  title: string;
  hint: string;
  icon: IconName;
  /** Cuántas especies distintas (o días distintos si `unit` es `dias`) hacen falta. */
  target: number;
  unit: 'especies' | 'dias';
  match: Matcher;
  reward: Reward;
  /** Periodo en el que cuentan los avistamientos, en ISO (UTC). */
  from: string;
  to: string;
};

type Template = Omit<Mission, 'id' | 'scope' | 'from' | 'to' | 'reward'> & { stamp: string };

/* --- Texto ---------------------------------------------------------------------- */

const GROUP_WORDS: Partial<Record<GroupCode, { one: string; many: string }>> = {
  ave: { one: 'un ave', many: 'aves' },
  mamifero: { one: 'un mamífero', many: 'mamíferos' },
  reptil: { one: 'un reptil', many: 'reptiles' },
  anfibio: { one: 'un anfibio', many: 'anfibios' },
  pez: { one: 'un pez', many: 'peces' },
  insecto: { one: 'un insecto', many: 'insectos' },
  aracnido: { one: 'un arácnido', many: 'arácnidos' },
  crustaceo: { one: 'un crustáceo', many: 'crustáceos' },
  molusco: { one: 'un molusco', many: 'moluscos' },
};

const ENVIRONMENTS: { bit: number; one: string; hint: string; icon: IconName }[] = [
  { bit: 8, one: 'de humedal', hint: 'Lagunas, marismas y carrizales.', icon: 'drop' },
  { bit: 32, one: 'de la costa', hint: 'Playas, acantilados y charcas de marea.', icon: 'wave' },
  { bit: 1024, one: 'de ciudad', hint: 'Parques, calles y tejados: hay más vida de la que parece.', icon: 'pin' },
  { bit: 1, one: 'de bosque', hint: 'Entre troncos, hojarasca y copas.', icon: 'tree' },
  { bit: 16, one: 'de río', hint: 'Orillas, remansos y pozas.', icon: 'drop' },
  { bit: 128, one: 'de roquedo', hint: 'Cortados, canchales y paredes de piedra.', icon: 'mountain' },
];

const nWords = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/* --- Plantillas semanales ------------------------------------------------------ */

type Make = (next: () => number) => Template;

const groupTemplate =
  (groups: GroupCode[], counts: Partial<Record<GroupCode, number>>): Make =>
  (next) => {
    const g = groups[Math.floor(next() * groups.length)];
    const w = GROUP_WORDS[g]!;
    const n = counts[g] ?? 1;
    return {
      kind: 'grupo',
      title: `Avista ${nWords(n, w.one, w.many)} esta semana`,
      hint: n === 1 ? 'Cuenta cualquier especie de este grupo.' : 'Cuentan especies distintas.',
      icon: g,
      target: n,
      unit: 'especies',
      match: { grp: g },
      stamp: `Sello de ${w.many}`,
    };
  };

const EASY: Make[] = [
  (next) => {
    const n = 3 + Math.floor(next() * 3);
    return {
      kind: 'especies',
      title: `Avista ${n} especies distintas`,
      hint: 'Valen animales de cualquier grupo.',
      icon: 'eye',
      target: n,
      unit: 'especies',
      match: {},
      stamp: 'Sello de explorador',
    };
  },
  (next) => {
    const n = 2 + Math.floor(next() * 2);
    return {
      kind: 'dias',
      title: `Sal a avistar ${n} días distintos`,
      hint: 'Un avistamiento al día basta.',
      icon: 'calendar',
      target: n,
      unit: 'dias',
      match: {},
      stamp: 'Sello de constancia',
    };
  },
  groupTemplate(['ave', 'insecto'], { ave: 3, insecto: 3 }),
];

const MEDIUM: Make[] = [
  groupTemplate(['mamifero', 'reptil', 'anfibio', 'pez', 'aracnido', 'crustaceo', 'molusco'], {
    mamifero: 1,
    reptil: 1,
    anfibio: 1,
    pez: 2,
    aracnido: 2,
    crustaceo: 1,
    molusco: 2,
  }),
  (next) => {
    const env = ENVIRONMENTS[Math.floor(next() * ENVIRONMENTS.length)];
    return {
      kind: 'ambiente',
      title: `Avista un animal ${env.one}`,
      hint: env.hint,
      icon: env.icon,
      target: 1,
      unit: 'especies',
      match: { env: env.bit },
      stamp: 'Sello de hábitat',
    };
  },
  () => ({
    kind: 'polinizador',
    title: 'Encuentra un insecto polinizador',
    hint: 'Abejas, abejorros, moscas de las flores y mariposas.',
    icon: 'sparkle',
    target: 1,
    unit: 'especies',
    match: { pollinator: true },
    stamp: 'Sello de polinizador',
  }),
];

const HARD: Make[] = [
  () => ({
    kind: 'rareza',
    title: 'Encuentra una especie rara',
    hint: 'Rara o legendaria: pocas personas la han fotografiado.',
    icon: 'star',
    target: 1,
    unit: 'especies',
    match: { minRarity: 4 },
    stamp: 'Sello de rareza',
  }),
  () => ({
    kind: 'amenazada',
    title: 'Avista una especie amenazada',
    hint: 'Vulnerable, en peligro o en peligro crítico según la UICN.',
    icon: 'heart',
    target: 1,
    unit: 'especies',
    match: { iucn: [...THREATENED] },
    stamp: 'Sello de guardián',
  }),
  () => ({
    kind: 'rareza',
    title: 'Avista 2 especies escasas o más raras',
    hint: 'Las que no se ven todos los días.',
    icon: 'star',
    target: 2,
    unit: 'especies',
    match: { minRarity: 3 },
    stamp: 'Sello de buen ojo',
  }),
];

const SLOTS: { pool: Make[]; tier: 1 | 2 | 3 }[] = [
  { pool: EASY, tier: 1 },
  { pool: MEDIUM, tier: 2 },
  { pool: HARD, tier: 3 },
];

const iso = (d: Date) => d.toISOString();

/** Los tres retos de la semana ISO que contiene la fecha: fácil, medio y difícil. */
export function weeklyMissions(date: Date = new Date()): Mission[] {
  const week = isoWeek(date);
  const next = rng(hash32(`semana:${week.id}`));
  return SLOTS.map(({ pool, tier }, slot) => {
    const t = pool[Math.floor(next() * pool.length)](next);
    const { stamp, ...rest } = t;
    return {
      ...rest,
      id: `${week.id}:${slot}:${t.kind}`,
      scope: 'semana' as const,
      reward: { tier, stamp },
      from: iso(week.start),
      to: iso(week.end),
    };
  });
}

/* --- Temporada ------------------------------------------------------------------ */

export type Season = 'primavera' | 'verano' | 'otono' | 'invierno' | 'tropico';

export const SEASON_LABEL: Record<Season, string> = {
  primavera: 'primavera',
  verano: 'verano',
  otono: 'otoño',
  invierno: 'invierno',
  tropico: 'trópico',
};

/**
 * Estación según el mes (0–11) y la latitud. Sin ubicación se asume el
 * hemisferio norte; entre ±15° no hay cuatro estaciones y se usa «trópico».
 */
export function seasonOf(month: number, lat: number | null): Season {
  if (lat != null && Math.abs(lat) <= 15) return 'tropico';
  const m = lat != null && lat < 0 ? (month + 6) % 12 : month;
  if (m === 11 || m <= 1) return 'invierno';
  if (m <= 4) return 'primavera';
  if (m <= 7) return 'verano';
  return 'otono';
}

const SEASONAL: Record<Season, Template[]> = {
  primavera: [
    {
      kind: 'grupo',
      title: 'Los anfibios despiertan',
      hint: 'En primavera salen a criar en charcas, fuentes y arroyos. Avista 2 anfibios.',
      icon: 'anfibio',
      target: 2,
      unit: 'especies',
      match: { grp: 'anfibio' },
      stamp: 'Sello de primavera',
    },
    {
      kind: 'polinizador',
      title: 'Abejas y mariposas en las flores',
      hint: 'Con las flores abiertas, los polinizadores se ponen a trabajar. Avista 2.',
      icon: 'sparkle',
      target: 2,
      unit: 'especies',
      match: { pollinator: true },
      stamp: 'Sello de primavera',
    },
    {
      kind: 'grupo',
      title: 'Concierto de primavera',
      hint: 'Es la época de cantar y anidar. Avista 4 aves distintas.',
      icon: 'ave',
      target: 4,
      unit: 'especies',
      match: { grp: 'ave' },
      stamp: 'Sello de primavera',
    },
  ],
  verano: [
    {
      kind: 'grupo',
      title: 'Sol de lagartija',
      hint: 'Con el calor, los reptiles salen a calentarse. Avista 2 reptiles.',
      icon: 'reptil',
      target: 2,
      unit: 'especies',
      match: { grp: 'reptil' },
      stamp: 'Sello de verano',
    },
    {
      kind: 'grupo',
      title: 'Zumbido de verano',
      hint: 'Es la temporada de más insectos. Avista 4 distintos.',
      icon: 'insecto',
      target: 4,
      unit: 'especies',
      match: { grp: 'insecto' },
      stamp: 'Sello de verano',
    },
    {
      kind: 'ambiente',
      title: 'Un día de costa',
      hint: 'Rocas, charcos y arena esconden animales. Avista 2 de la costa.',
      icon: 'wave',
      target: 2,
      unit: 'especies',
      match: { env: 32 },
      stamp: 'Sello de verano',
    },
  ],
  otono: [
    {
      kind: 'migradora',
      title: 'Aves de paso',
      hint: 'En otoño las aves migradoras se ponen en camino. Avista 2.',
      icon: 'ave',
      target: 2,
      unit: 'especies',
      match: { grp: 'ave', migratory: true },
      stamp: 'Sello de otoño',
    },
    {
      kind: 'ambiente',
      title: 'Humedales de paso',
      hint: 'Lagunas y marismas se llenan de visitantes. Avista 2 animales de humedal.',
      icon: 'drop',
      target: 2,
      unit: 'especies',
      match: { env: 8 },
      stamp: 'Sello de otoño',
    },
    {
      kind: 'grupo',
      title: 'Reservas para el invierno',
      hint: 'Muchos mamíferos acumulan grasa antes del frío. Avista uno.',
      icon: 'mamifero',
      target: 1,
      unit: 'especies',
      match: { grp: 'mamifero' },
      stamp: 'Sello de otoño',
    },
  ],
  invierno: [
    {
      kind: 'migradora',
      title: 'Aves invernantes',
      hint: 'Muchas aves migradoras pasan el invierno aquí. Avista 2.',
      icon: 'ave',
      target: 2,
      unit: 'especies',
      match: { grp: 'ave', migratory: true },
      stamp: 'Sello de invierno',
    },
    {
      kind: 'ambiente',
      title: 'Humedales en invierno',
      hint: 'Con el frío, los humedales concentran aves. Avista 2 animales de humedal.',
      icon: 'drop',
      target: 2,
      unit: 'especies',
      match: { env: 8 },
      stamp: 'Sello de invierno',
    },
    {
      kind: 'grupo',
      title: 'Huellas en el frío',
      hint: 'Los mamíferos se ven mejor sin hojas. Avista uno.',
      icon: 'mamifero',
      target: 1,
      unit: 'especies',
      match: { grp: 'mamifero' },
      stamp: 'Sello de invierno',
    },
  ],
  tropico: [
    {
      kind: 'ambiente',
      title: 'Selva viva',
      hint: 'La selva nunca descansa. Avista 2 animales de selva tropical.',
      icon: 'tree',
      target: 2,
      unit: 'especies',
      match: { env: 4096 },
      stamp: 'Sello del trópico',
    },
    {
      kind: 'grupo',
      title: 'Anfibios de la lluvia',
      hint: 'Tras la lluvia cantan y salen a la luz. Avista 2 anfibios.',
      icon: 'anfibio',
      target: 2,
      unit: 'especies',
      match: { grp: 'anfibio' },
      stamp: 'Sello del trópico',
    },
    {
      kind: 'grupo',
      title: 'Aves de colores',
      hint: 'El trópico guarda las aves más vistosas. Avista 4 distintas.',
      icon: 'ave',
      target: 4,
      unit: 'especies',
      match: { grp: 'ave' },
      stamp: 'Sello del trópico',
    },
  ],
};

/** Los dos retos del mes según la estación del hemisferio. */
export function seasonalMissions(date: Date = new Date(), lat: number | null = null): Mission[] {
  const month = monthRange(date);
  const season = seasonOf(date.getMonth(), lat);
  const next = rng(hash32(`temporada:${month.id}:${season}`));
  const picks = shuffled(SEASONAL[season], next).slice(0, 2);
  return picks.map((t, i) => {
    const { stamp, ...rest } = t;
    return {
      ...rest,
      id: `${month.id}:${season}:${i}:${t.kind}`,
      scope: 'temporada' as const,
      reward: { tier: (i === 0 ? 2 : 3) as 2 | 3, stamp },
      from: iso(month.start),
      to: iso(month.end),
    };
  });
}

/* --- Avance --------------------------------------------------------------------- */

export type SightingLite = { species_id: number | null; created_at: string };

export type Progress = { value: number; target: number; done: boolean; ratio: number };

/**
 * Avance de un reto: especies distintas que cumplen la condición dentro del
 * periodo (o días distintos con algún avistamiento).
 */
export function missionProgress(m: Mission, sightings: SightingLite[], meta: Map<number, SpeciesMeta>): Progress {
  let value = 0;
  if (m.unit === 'dias') {
    value = new Set(sightings.filter((s) => s.created_at >= m.from && s.created_at < m.to).map((s) => dayKey(new Date(s.created_at)))).size;
  } else {
    const ids = new Set<number>();
    for (const s of sightings) {
      if (s.species_id == null || s.created_at < m.from || s.created_at >= m.to) continue;
      const sp = meta.get(s.species_id);
      if (sp && matches(sp, m.match)) ids.add(s.species_id);
    }
    value = ids.size;
  }
  return { value, target: m.target, done: value >= m.target, ratio: Math.min(1, value / m.target) };
}

/* --- Especies concretas para un reto de temporada --------------------------------- */

export type SuggestedSpecies = { id: number; sci: string; name_es: string | null; grp: GroupCode; img: string | null };

/**
 * Especies con foto y nombre en español que cumplen el reto y se han observado
 * de verdad en el país del usuario (al menos 3 observaciones, como el filtro de
 * país del Bestiario). Se eligen de las 12 más vistas con la semilla del mes,
 * así que cada mes propone otras. El catálogo no guarda estacionalidad por
 * especie, así que la temporada la fija la condición del reto, no un calendario.
 */
export async function suggestSpecies(
  catalog: Reader,
  m: Mission,
  cc: string,
  seed: string,
  count = 3,
): Promise<SuggestedSpecies[]> {
  const { clauses, params } = matcherSql(m.match);
  const rows = await catalog.getAllAsync<SuggestedSpecies>(
    `SELECT s.id, s.sci, s.name_es, s.grp, s.img
     FROM country c JOIN species_v s ON s.id = c.id LEFT JOIN detail d ON d.id = s.id
     WHERE c.cc = ? AND c.obs >= 3 AND s.img IS NOT NULL AND s.name_es IS NOT NULL
       ${clauses.map((c2) => `AND (${c2})`).join(' ')}
     ORDER BY c.obs DESC LIMIT 12`,
    [cc.toUpperCase(), ...params],
  );
  return shuffled(rows, rng(hash32(`${seed}:${m.id}`)))
    .slice(0, count)
    .map((r) => ({ ...r, img: expandUrl(r.img) }));
}

export const stampTierName = (tier: 1 | 2 | 3) => (['', 'bronce', 'plata', 'oro'] as const)[tier];
