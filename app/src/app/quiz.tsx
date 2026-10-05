import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { GroupPill } from '@/components/GroupPill';
import { Icon } from '@/components/Icon';
import { Appear } from '@/components/motion';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { FadeImage } from '@/components/motion/FadeImage';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { QUESTIONS_PER_DAY, scoreOf, type QuizOption, type QuizQuestion } from '@/lib/quiz';
import { useQuiz } from '@/lib/useQuiz';
import { duration, ease, groupColor, radius, space, usePalette } from '@/theme';

type Status = 'idle' | 'right' | 'wrong' | 'dim';

/*
 * Quiz diario «¿Quién es?»: cinco fotos, cuatro nombres de la misma familia.
 * Al responder, la opción correcta se tiñe de verde y, si fallas, la elegida
 * se tiñe de rojo y se sacude un instante; debajo aparece un dato curioso de la
 * ficha. Las preguntas son las mismas para todos ese día.
 */
export default function Quiz() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { loading, questions, answers, finished, streak, state, answer } = useQuiz();
  // La respuesta recién dada se enseña con su feedback antes de pasar a la siguiente.
  const [revealed, setRevealed] = useState<{ q: number; pick: number } | null>(null);

  const q = revealed ? revealed.q : answers.length;
  const question = questions[q];
  const showSummary = !loading && questions.length > 0 && finished && !revealed;

  const onPick = (opt: QuizOption) => {
    if (revealed || !question) return;
    const right = opt.id === question.id;
    Haptics.notificationAsync(right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    setRevealed({ q, pick: opt.id });
    answer(opt.id);
  };

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.lg }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
            <Icon name="back" />
          </Press>
          <View style={styles.flex} />
          {streak > 0 ? (
            <View style={[styles.streak, { backgroundColor: palette.brandTint }]} accessible accessibilityLabel={`Racha de ${streak} días`}>
              <Icon name="sparkle" size={16} color={palette.brandInk} />
              <Txt variant="label" tone="brand">
                {streak} {streak === 1 ? 'día' : 'días'} seguidos
              </Txt>
            </View>
          ) : null}
        </View>

        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          ¿Quién es?
        </Txt>

        {loading ? (
          <Txt variant="body" tone="soft" style={styles.pad}>
            Preparando las preguntas de hoy…
          </Txt>
        ) : questions.length === 0 ? (
          <Txt variant="body" tone="soft" style={styles.pad}>
            No he podido preparar el quiz de hoy. Vuelve a intentarlo en un rato.
          </Txt>
        ) : showSummary ? (
          <Summary questions={questions} answers={answers} best={state.bestScore} bestStreak={state.bestStreak} streak={streak} />
        ) : question ? (
          <>
            <Dots total={QUESTIONS_PER_DAY} current={q} answers={answers} questions={questions} />
            <QuestionView key={question.id} question={question} index={q} revealed={revealed} onPick={onPick} onNext={() => setRevealed(null)} last={q === questions.length - 1} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Dots({ total, current, answers, questions }: { total: number; current: number; answers: number[]; questions: QuizQuestion[] }) {
  const palette = usePalette();
  return (
    <View style={styles.dots} accessible accessibilityLabel={`Pregunta ${current + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const done = i < answers.length;
        const right = done && questions[i]?.id === answers[i];
        const bg = done ? (right ? palette.leaf : palette.red) : i === current ? palette.strong : palette.lineStrong;
        return <View key={i} style={[styles.dot, { backgroundColor: bg, flex: i === current ? 2 : 1 }]} />;
      })}
    </View>
  );
}

function QuestionView({
  question,
  index,
  revealed,
  onPick,
  onNext,
  last,
}: {
  question: QuizQuestion;
  index: number;
  revealed: { q: number; pick: number } | null;
  onPick: (o: QuizOption) => void;
  onNext: () => void;
  last: boolean;
}) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const g = groupColor(question.grp);
  const photo = width - space.lg * 2;
  const isRight = revealed ? revealed.pick === question.id : false;

  return (
    <Appear from="below">
      <Card padding="sm" style={styles.photoCard}>
        <FadeImage
          source={question.img}
          style={{ width: photo - space.sm * 2, height: (photo - space.sm * 2) * 0.75, borderRadius: radius.md }}
          contentFit="cover"
          placeholderColor={g.tint}
          accessibilityLabel="Foto del animal que hay que reconocer"
        />
      </Card>
      <View style={styles.prompt}>
        <Txt variant="subheading" style={styles.flex}>
          Pregunta {index + 1}: ¿qué animal es?
        </Txt>
        <GroupPill code={question.grp} />
      </View>

      <View style={styles.options}>
        {question.options.map((o) => {
          const status: Status = !revealed ? 'idle' : o.id === question.id ? 'right' : o.id === revealed.pick ? 'wrong' : 'dim';
          return <OptionRow key={o.id} label={o.label} status={status} disabled={!!revealed} onPress={() => onPick(o)} />;
        })}
      </View>

      {revealed ? (
        <Appear from="below" delay={80}>
          <Card tone="tint" tint={isRight ? palette.leafTint : palette.skyTint} style={styles.feedback} accessibilityLabel="Resultado y dato curioso">
            <Txt variant="heading" tone="ink">
              {isRight ? '¡Correcto!' : `Era ${question.name}`}
            </Txt>
            <Txt variant="sci" tone="soft">
              {question.sci}
            </Txt>
            <Txt variant="body" style={styles.fact}>
              {question.fact}
            </Txt>
            <Press onPress={onNext} accessibilityRole="button" style={[styles.next, { backgroundColor: palette.brand }]}>
              <Txt variant="bodyStrong" tone="onBrand">
                {last ? 'Ver resultado' : 'Siguiente'}
              </Txt>
              <Icon name="chevronRight" size={20} color={palette.onBrand} />
            </Press>
          </Card>
        </Appear>
      ) : null}
    </Appear>
  );
}

function OptionRow({ label, status, disabled, onPress }: { label: string; status: Status; disabled: boolean; onPress: () => void }) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const wash = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    wash.set(withTiming(status === 'right' || status === 'wrong' ? 1 : 0, { duration: duration.small, easing: ease.out }));
    if (status === 'wrong' && !reduced) {
      shake.set(
        withSequence(
          withTiming(-7, { duration: 55, easing: ease.out }),
          withTiming(7, { duration: 90, easing: ease.inOut }),
          withTiming(-4, { duration: 80, easing: ease.inOut }),
          withTiming(0, { duration: 60, easing: ease.out }),
        ),
      );
    }
  }, [status, reduced, wash, shake]);

  const bg = status === 'right' ? palette.leafTint : status === 'wrong' ? palette.redTint : palette.surface;
  const border = status === 'right' ? palette.leaf : status === 'wrong' ? palette.red : palette.line;
  const washStyle = useAnimatedStyle(() => ({ opacity: wash.get() }));
  const move = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  return (
    <Animated.View style={[move, status === 'dim' ? { opacity: 0.55 } : null]}>
      <Press
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        style={[styles.option, { backgroundColor: palette.surface, borderColor: status === 'idle' || status === 'dim' ? palette.line : border }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bg, borderRadius: radius.lg - 1 }, washStyle]} />
        <Txt variant="bodyStrong" style={styles.flex}>
          {label}
        </Txt>
        {status === 'right' ? <Icon name="check" size={22} color={palette.leaf} strokeWidth={2.4} /> : null}
        {status === 'wrong' ? <Icon name="close" size={22} color={palette.red} strokeWidth={2.4} /> : null}
      </Press>
    </Animated.View>
  );
}

function Summary({ questions, answers, best, bestStreak, streak }: { questions: QuizQuestion[]; answers: number[]; best: number; bestStreak: number; streak: number }) {
  const palette = usePalette();
  const score = scoreOf(answers, questions);
  const msg =
    score === questions.length
      ? 'Ojo de naturalista. Pleno.'
      : score >= 3
        ? 'Muy bien. Se nota que miras con atención.'
        : score >= 1
          ? 'Cada fallo se aprende. Mañana, otras cinco.'
          : 'Hoy ha tocado aprender. Mañana, otras cinco.';
  return (
    <>
      <Appear>
        <Card tone="tint" tint={palette.brandTint} style={styles.scoreCard}>
          <View style={styles.scoreRow}>
            <AnimatedNumber value={score} variant="hero" color={palette.brandInk} />
            <Txt variant="title" tone="brand">
              {' '}
              de {questions.length}
            </Txt>
          </View>
          <Txt variant="body">{msg}</Txt>
          <View style={styles.facts}>
            <Txt variant="small" tone="soft">
              Racha: {streak} {streak === 1 ? 'día' : 'días'} (mejor: {bestStreak})
            </Txt>
            <Txt variant="small" tone="soft">
              Mejor puntuación: {best} de {questions.length}
            </Txt>
          </View>
        </Card>
      </Appear>
      <Appear index={1}>
        <Card style={styles.review}>
          <Txt variant="subheading">Repaso</Txt>
          {questions.map((qu, i) => {
            const ok = answers[i] === qu.id;
            return (
              <View key={qu.id} style={styles.reviewRow} accessible accessibilityLabel={`${qu.name}: ${ok ? 'acertada' : 'fallada'}`}>
                <FadeImage source={qu.img} style={styles.reviewThumb} contentFit="cover" placeholderColor={groupColor(qu.grp).tint} />
                <View style={styles.flex}>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {qu.name}
                  </Txt>
                  <Txt variant="sci" tone="soft" numberOfLines={1}>
                    {qu.sci}
                  </Txt>
                </View>
                <Icon name={ok ? 'check' : 'close'} size={22} color={ok ? palette.leaf : palette.red} strokeWidth={2.4} />
              </View>
            );
          })}
        </Card>
        <Txt variant="small" tone="faint" style={styles.note}>
          Vuelve mañana: habrá cinco preguntas nuevas.
        </Txt>
      </Appear>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, minHeight: 32, borderRadius: radius.pill },
  title: { marginTop: space.lg },
  pad: { marginTop: space.lg },
  dots: { flexDirection: 'row', gap: space.xs, marginTop: space.md, marginBottom: space.lg },
  dot: { height: 6, borderRadius: 3 },
  photoCard: { alignItems: 'center' },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  options: { gap: space.sm, marginTop: space.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.lg, borderRadius: radius.lg, borderWidth: 1.5, overflow: 'hidden' },
  feedback: { marginTop: space.lg, gap: space.xs },
  fact: { marginTop: space.sm },
  next: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: 48, borderRadius: radius.pill, marginTop: space.lg },
  scoreCard: { gap: space.sm },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  facts: { gap: space.xxs, marginTop: space.xs },
  review: { marginTop: space.lg, gap: space.md },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  reviewThumb: { width: 48, height: 48, borderRadius: radius.md },
  note: { marginTop: space.md },
});
