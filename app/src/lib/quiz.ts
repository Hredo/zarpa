import { addDays, dayNumberOfKey, hash32, rng, shuffled } from './gameUtil';
import type { GroupCode } from './groups';
import { rarityInfo, IUCN_LABEL } from './groups';
import { expandUrl } from './urls';
import type { Reader } from './speciesMatch';

/*
 * Quiz diario «¿Quién es?». Cinco preguntas por día, las mismas para todo el
 * mundo: la fecha fija qué especies salen y qué opciones las acompañan. Cada
 * pregunta enseña la foto de una especie conocida (con nombre en español) y
 * cuatro nombres de su misma familia (o de su mismo orden o grupo si la familia
 * no da para tres), para que sea difícil pero justa: nunca un ave contra un pez.
 */

export const QUESTIONS_PER_DAY = 5;
export const OPTIONS = 4;
/** Las N especies más observadas con foto y nombre: de ahí salen las protagonistas. */
const POOL = 3000;
/** Observaciones mínimas de una distractora (que sea un animal que el usuario pueda conocer). */
const DISTRACTOR_MIN_OBS = 300;

export type QuizOption = { id: number; label: string };

export type QuizQuestion = {
  id: number;
  img: string;
  grp: GroupCode;
  sci: string;
  /** Nombre en español de la respuesta correcta. */
  name: string;
  /** Cuatro opciones, ya barajadas. */
  options: QuizOption[];
  /** Dato curioso que se enseña tras responder. */
  fact: string;
};

type TargetRow = {
  id: number;
  sci: string;
  name_es: string;
  grp: GroupCode;
  img: string;
  rarity: number;
  iucn: string | null;
  diet: string | null;
  family_id: number | null;
  order_id: number | null;
  class_id: number | null;
  family_es: string | null;
  summary: string | null;
  summary_lang: string | null;
  migration: string | null;
  activity: string | null;
};

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/* --- Dato curioso ----------------------------------------------------------------- */

/** Primera frase útil de un resumen (hasta ~200 caracteres), sin cortar a media palabra. */
export function firstSentences(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  let end = clean.length;
  const re = /[.!?]\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    // «(Linnaeus, 1758).» y siglas sueltas no son un final de frase.
    if (m.index >= 40) {
      end = m.index + 1;
      break;
    }
  }
  const first = clean.slice(0, end);
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1))}…`;
}

const HABITS: Record<string, string> = {
  Nocturno: 'Es un animal de hábitos nocturnos: la mejor hora para verlo es de noche.',
  Diurno: 'Es un animal diurno: se deja ver con luz del día.',
  Crepuscular: 'Es crepuscular: se activa al amanecer y al atardecer.',
};

/**
 * Dato curioso de la especie. Prefiere la introducción de Wikipedia en español;
 * sin ella (o si está en otro idioma) usa un rasgo del catálogo. Nunca inventa.
 */
export function factFor(sp: Pick<TargetRow, 'summary' | 'summary_lang' | 'iucn' | 'migration' | 'activity' | 'diet' | 'rarity' | 'family_es' | 'grp'>): string {
  if (sp.summary && sp.summary_lang === 'es') return firstSentences(sp.summary);
  if (sp.iucn && IUCN_LABEL[sp.iucn] && ['VU', 'EN', 'CR'].includes(sp.iucn)) {
    return `Según la UICN está en la categoría «${IUCN_LABEL[sp.iucn].toLowerCase()}»: verla es un privilegio.`;
  }
  if (sp.migration === 'Migradora') return 'Es un ave migradora: pasa el año viajando entre sus zonas de cría e invernada.';
  if (sp.migration === 'Migradora parcial') return 'Es una migradora parcial: parte de su población viaja y otra se queda todo el año.';
  if (sp.activity && HABITS[sp.activity.split(' ')[0]]) return HABITS[sp.activity.split(' ')[0]];
  if (sp.diet) return `Su dieta es sobre todo ${sp.diet.toLowerCase()}.`;
  if (sp.family_es) return `Pertenece a la familia de ${sp.family_es.toLowerCase()}.`;
  return `Rareza en Zarpa: ${rarityInfo(sp.rarity).label.toLowerCase()}.`;
}

/* --- Construcción de las preguntas ------------------------------------------------ */

const TARGET_SQL = `SELECT s.id, s.sci, s.name_es, s.grp, s.img, s.rarity, s.iucn, s.diet, s.family_id, s.order_id, s.class_id,
    f.es AS family_es, d.summary, d.summary_lang, d.migration, d.activity
  FROM species s LEFT JOIN taxon f ON f.id = s.family_id LEFT JOIN detail d ON d.id = s.id
  WHERE s.id = (SELECT id FROM species WHERE img IS NOT NULL AND name_es IS NOT NULL AND rg_obs >= 300 ORDER BY rg_obs DESC, id LIMIT 1 OFFSET ?)`;

/** Índice (en la reserva de candidatas) de la pregunta `q` del día. */
export function poolOffset(key: string, q: number, attempt = 0): number {
  return hash32(`quiz:${key}:${q}:${attempt}`) % POOL;
}

async function distractors(reader: Reader, t: TargetRow, next: () => number): Promise<QuizOption[]> {
  const chosen: QuizOption[] = [];
  const names = new Set([norm(t.name_es)]);
  const tiers: [string, number | GroupCode | null][] = [
    ['family_id', t.family_id],
    ['order_id', t.order_id],
    ['class_id', t.class_id],
    ['grp', t.grp],
  ];
  for (const [col, value] of tiers) {
    if (chosen.length >= OPTIONS - 1) break;
    if (value == null) continue;
    const rows = await reader.getAllAsync<{ id: number; name_es: string }>(
      `SELECT id, name_es FROM species WHERE rg_obs >= ? AND name_es IS NOT NULL AND id <> ? AND ${col} = ? ORDER BY rg_obs DESC LIMIT 30`,
      [DISTRACTOR_MIN_OBS, t.id, value],
    );
    for (const r of shuffled(rows, next)) {
      const n = norm(r.name_es);
      if (names.has(n)) continue;
      names.add(n);
      chosen.push({ id: r.id, label: r.name_es });
      if (chosen.length >= OPTIONS - 1) break;
    }
  }
  return chosen;
}

/**
 * Las cinco preguntas de un día (`key` = «2026-10-05»). Determinista: mismas
 * especies, mismas opciones y mismo orden en cualquier móvil. Una pregunta que
 * no consigue tres distractoras se sustituye por otra protagonista.
 */
export async function buildDailyQuiz(reader: Reader, key: string): Promise<QuizQuestion[]> {
  const out: QuizQuestion[] = [];
  const used = new Set<number>();
  for (let q = 0; q < QUESTIONS_PER_DAY; q++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const [t] = await reader.getAllAsync<TargetRow>(TARGET_SQL, [poolOffset(key, q, attempt)]);
      if (!t || used.has(t.id)) continue;
      const next = rng(hash32(`opciones:${key}:${q}:${t.id}`));
      const others = await distractors(reader, t, next);
      if (others.length < OPTIONS - 1) continue;
      used.add(t.id);
      out.push({
        id: t.id,
        img: expandUrl(t.img) ?? t.img,
        grp: t.grp,
        sci: t.sci,
        name: t.name_es,
        options: shuffled([{ id: t.id, label: t.name_es }, ...others], next),
        fact: factFor(t),
      });
      break;
    }
  }
  return out;
}

/* --- Estado y puntuación ------------------------------------------------------------ */

export type QuizState = {
  v: 1;
  /** Respuestas del día en curso: id de la opción elegida en cada pregunta. */
  today: { day: string; answers: number[] } | null;
  /** Último día en que se terminó el quiz. */
  lastCompleted: string | null;
  streak: number;
  bestStreak: number;
  bestScore: number;
  played: number;
  totalScore: number;
  lastScore: number | null;
};

export const EMPTY_QUIZ: QuizState = {
  v: 1,
  today: null,
  lastCompleted: null,
  streak: 0,
  bestStreak: 0,
  bestScore: 0,
  played: 0,
  totalScore: 0,
  lastScore: null,
};

export function scoreOf(answers: number[], questions: QuizQuestion[]): number {
  return answers.reduce((n, a, i) => n + (questions[i] && questions[i].id === a ? 1 : 0), 0);
}

/** Racha vigente: viva si se terminó hoy o ayer; si no, 0. */
export function currentStreak(state: QuizState, today: string): number {
  if (!state.lastCompleted) return 0;
  return state.lastCompleted === today || state.lastCompleted === addDays(today, -1) ? state.streak : 0;
}

/** Respuestas guardadas de `day` (vacías si el estado es de otro día). */
export function answersOf(state: QuizState, day: string): number[] {
  return state.today?.day === day ? state.today.answers : [];
}

export function isFinished(state: QuizState, day: string, questions: QuizQuestion[]): boolean {
  return questions.length > 0 && answersOf(state, day).length >= questions.length;
}

/** Registra una respuesta. Al contestar la última cierra el día: puntuación y racha. */
export function recordAnswer(state: QuizState, day: string, questions: QuizQuestion[], optionId: number): QuizState {
  const answers = answersOf(state, day);
  if (answers.length >= questions.length) return state;
  const nextAnswers = [...answers, optionId];
  const today = { day, answers: nextAnswers };
  if (nextAnswers.length < questions.length) return { ...state, today };

  const score = scoreOf(nextAnswers, questions);
  const yesterday = addDays(day, -1);
  const streak = state.lastCompleted === yesterday ? state.streak + 1 : 1;
  return {
    ...state,
    today,
    lastCompleted: day,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    bestScore: Math.max(state.bestScore, score),
    played: state.played + 1,
    totalScore: state.totalScore + score,
    lastScore: score,
  };
}

/** Días transcurridos entre dos claves (para mensajes tipo «ayer»). */
export function daysBetween(a: string, b: string): number {
  return dayNumberOfKey(b) - dayNumberOfKey(a);
}
