import Database from 'better-sqlite3';
import path from 'node:path';

import { addDays } from '@/lib/gameUtil';
import {
  buildDailyQuiz,
  currentStreak,
  EMPTY_QUIZ,
  factFor,
  firstSentences,
  OPTIONS,
  QUESTIONS_PER_DAY,
  recordAnswer,
  scoreOf,
  type QuizQuestion,
  type QuizState,
} from '@/lib/quiz';
import type { Reader } from '@/lib/speciesMatch';

const db = new Database(path.join(__dirname, '..', 'assets', 'db', 'catalogo.db'), { readonly: true });
const reader: Reader = {
  getAllAsync: async <T,>(sql: string, params: (string | number)[]) => db.prepare(sql).all(...params) as T[],
};
afterAll(() => db.close());

describe('preguntas del día', () => {
  it('son cinco, deterministas y distintas de un día a otro', async () => {
    const a = await buildDailyQuiz(reader, '2026-10-05');
    const b = await buildDailyQuiz(reader, '2026-10-05');
    const c = await buildDailyQuiz(reader, '2026-10-06');
    expect(a).toHaveLength(QUESTIONS_PER_DAY);
    expect(b).toEqual(a);
    expect(c.map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it('cada pregunta tiene foto, cuatro nombres distintos en español y la correcta entre ellos', async () => {
    for (const day of ['2026-10-05', '2026-12-31', '2027-02-14']) {
      const qs = await buildDailyQuiz(reader, day);
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
      for (const q of qs) {
        expect(q.img).toMatch(/^https?:/);
        expect(q.options).toHaveLength(OPTIONS);
        expect(new Set(q.options.map((o) => o.label.toLowerCase())).size).toBe(OPTIONS);
        expect(q.options.filter((o) => o.id === q.id)).toHaveLength(1);
        expect(q.options.find((o) => o.id === q.id)!.label).toBe(q.name);
        expect(q.fact.length).toBeGreaterThan(10);
      }
    }
  });

  it('las opciones son del mismo grupo que la respuesta (justas pero difíciles)', async () => {
    const qs = await buildDailyQuiz(reader, '2026-10-05');
    const grp = db.prepare('SELECT grp, family_id, class_id FROM species WHERE id = ?');
    for (const q of qs) {
      const target = grp.get(q.id) as { grp: string; class_id: number };
      for (const o of q.options) {
        const r = grp.get(o.id) as { grp: string; class_id: number };
        expect(r.grp).toBe(target.grp);
      }
    }
  });
});

describe('dato curioso', () => {
  it('toma la primera frase del resumen en español sin cortar nombres con punto', () => {
    const t =
      'El gorrión común (Passer domesticus Linnaeus, 1758) es una especie de ave paseriforme de la familia Passeridae. Es nativo de Eurasia y el norte de África.';
    expect(firstSentences(t)).toBe('El gorrión común (Passer domesticus Linnaeus, 1758) es una especie de ave paseriforme de la familia Passeridae.');
  });

  it('recorta lo muy largo en una palabra entera', () => {
    const out = firstSentences('palabra '.repeat(60), 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith('…')).toBe(true);
  });

  it('no usa resúmenes en inglés: cae a un rasgo del catálogo', () => {
    const base = { summary: 'The common sparrow is a bird.', summary_lang: 'en', iucn: null, migration: 'Migradora', activity: null, diet: null, rarity: 1, family_es: null, grp: 'ave' as const };
    expect(factFor(base)).toMatch(/migradora/);
    expect(factFor({ ...base, migration: null, diet: 'Granívoro' })).toMatch(/granívoro/);
    expect(factFor({ ...base, migration: null })).toMatch(/Rareza/);
  });
});

describe('puntuación y racha', () => {
  const qs: QuizQuestion[] = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    img: 'https://x/y.jpg',
    grp: 'ave',
    sci: 'Aves ex',
    name: `Ave ${i}`,
    options: [],
    fact: 'Dato.',
  }));

  const play = (state: QuizState, day: string, picks: number[]) => picks.reduce((s, p) => recordAnswer(s, day, qs, p), state);

  it('puntúa y cierra el día con la última respuesta', () => {
    const s = play(EMPTY_QUIZ, '2026-10-05', [1, 2, 99, 4, 99]);
    expect(scoreOf(s.today!.answers, qs)).toBe(3);
    expect(s.lastScore).toBe(3);
    expect(s.streak).toBe(1);
    expect(s.played).toBe(1);
    expect(s.bestScore).toBe(3);
  });

  it('una partida a medias no cuenta hasta terminar', () => {
    const s = play(EMPTY_QUIZ, '2026-10-05', [1, 2]);
    expect(s.played).toBe(0);
    expect(s.today!.answers).toEqual([1, 2]);
    expect(s.lastCompleted).toBeNull();
  });

  it('no deja contestar de más ni repetir el día', () => {
    const done = play(EMPTY_QUIZ, '2026-10-05', [1, 2, 3, 4, 5]);
    expect(recordAnswer(done, '2026-10-05', qs, 1)).toBe(done);
  });

  it('la racha sube días seguidos y se reinicia al saltarse uno', () => {
    let s = play(EMPTY_QUIZ, '2026-10-05', [1, 2, 3, 4, 5]);
    s = play(s, '2026-10-06', [1, 2, 3, 4, 5]);
    expect(s.streak).toBe(2);
    s = play(s, '2026-10-07', [1, 2, 3, 4, 5]);
    expect(s.streak).toBe(3);
    expect(s.bestStreak).toBe(3);
    s = play(s, '2026-10-09', [1, 2, 3, 4, 5]);
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(3);
  });

  it('cruza fin de mes y de año sin romper la racha', () => {
    let s = play(EMPTY_QUIZ, '2026-12-31', [1, 2, 3, 4, 5]);
    s = play(s, '2027-01-01', [1, 2, 3, 4, 5]);
    expect(s.streak).toBe(2);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('la racha mostrada caduca si pasa más de un día sin jugar', () => {
    const s = play(EMPTY_QUIZ, '2026-10-05', [1, 2, 3, 4, 5]);
    expect(currentStreak(s, '2026-10-05')).toBe(1);
    expect(currentStreak(s, '2026-10-06')).toBe(1);
    expect(currentStreak(s, '2026-10-07')).toBe(0);
  });

  it('un día nuevo empieza con respuestas vacías', () => {
    const s = play(EMPTY_QUIZ, '2026-10-05', [1, 2, 3, 4, 5]);
    const next = recordAnswer(s, '2026-10-06', qs, 1);
    expect(next.today).toEqual({ day: '2026-10-06', answers: [1] });
  });
});
