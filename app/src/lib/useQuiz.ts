import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { catalog } from '@/db';

import { dayKey } from './gameUtil';
import {
  answersOf,
  buildDailyQuiz,
  currentStreak,
  EMPTY_QUIZ,
  isFinished,
  QUESTIONS_PER_DAY,
  recordAnswer,
  type QuizQuestion,
  type QuizState,
} from './quiz';

const KEY = '@zarpa/quiz/v1';

async function readState(): Promise<QuizState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as QuizState) : null;
    return parsed && parsed.v === 1 ? { ...EMPTY_QUIZ, ...parsed } : EMPTY_QUIZ;
  } catch {
    return EMPTY_QUIZ;
  }
}

async function writeState(state: QuizState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Sin almacenamiento el quiz funciona igual; solo no recuerda la racha.
  }
}

let cached: { day: string; questions: QuizQuestion[] } | null = null;

async function questionsFor(day: string): Promise<QuizQuestion[]> {
  if (cached?.day === day) return cached.questions;
  const questions = await buildDailyQuiz(catalog(), day);
  cached = { day, questions };
  return questions;
}

export type QuizView = {
  loading: boolean;
  day: string;
  questions: QuizQuestion[];
  /** Opciones elegidas hoy, una por pregunta contestada. */
  answers: number[];
  finished: boolean;
  streak: number;
  state: QuizState;
  answer: (optionId: number) => void;
};

/** Quiz de hoy: preguntas deterministas, respuestas y racha guardadas en AsyncStorage. */
export function useQuiz(): QuizView {
  const day = dayKey();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [state, setState] = useState<QuizState>(EMPTY_QUIZ);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([questionsFor(day), readState()])
      .then(([q, s]) => {
        if (!alive) return;
        setQuestions(q);
        setState(s);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [day]);

  const answer = useCallback(
    (optionId: number) => {
      const next = recordAnswer(state, day, questions, optionId);
      if (next === state) return;
      setState(next);
      writeState(next);
    },
    [day, questions, state],
  );

  return {
    loading,
    day,
    questions,
    answers: answersOf(state, day),
    finished: isFinished(state, day, questions),
    streak: currentStreak(state, day),
    state,
    answer,
  };
}

export type QuizSummary = {
  loading: boolean;
  answered: number;
  finished: boolean;
  /** Aciertos de hoy si ya terminó. */
  score: number | null;
  streak: number;
};

/**
 * Resumen ligero para la tarjeta de Inicio: solo lee AsyncStorage, sin tocar el
 * catálogo (las preguntas se construyen al abrir el quiz). Se refresca cada vez
 * que la pantalla vuelve a tener el foco, para que al salir del quiz esté al día.
 */
export function useQuizSummary(): QuizSummary {
  const [state, setState] = useState<QuizState | null>(null);
  const day = dayKey();
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      readState().then((s) => alive && setState(s));
      return () => {
        alive = false;
      };
    }, []),
  );
  const s = state ?? EMPTY_QUIZ;
  const answered = answersOf(s, day).length;
  const finished = answered >= QUESTIONS_PER_DAY;
  return { loading: state == null, answered, finished, score: finished ? s.lastScore : null, streak: currentStreak(s, day) };
}
