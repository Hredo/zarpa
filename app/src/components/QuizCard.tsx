import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { QUESTIONS_PER_DAY } from '@/lib/quiz';
import { useQuizSummary } from '@/lib/useQuiz';
import { radius, space, usePalette } from '@/theme';

import { Card } from './Card';
import { Icon } from './Icon';
import { Txt } from './Txt';

/**
 * Tarjeta de Inicio del quiz diario «¿Quién es?»: invita a jugar, retoma donde
 * se quedó o enseña la puntuación de hoy. Solo lee AsyncStorage; las preguntas
 * se preparan al abrir el quiz.
 *
 * API: `<QuizCard />`. Sin props.
 */
export function QuizCard() {
  const palette = usePalette();
  const { answered, finished, score, streak, loading } = useQuizSummary();

  const title = finished ? `Hoy: ${score ?? 0} de ${QUESTIONS_PER_DAY}` : answered > 0 ? `Vas por la pregunta ${answered + 1}` : '¿Quién es?';
  const sub = finished
    ? 'Vuelve mañana para otras cinco fotos.'
    : answered > 0
      ? 'Sigue donde lo dejaste.'
      : `${QUESTIONS_PER_DAY} fotos, 4 nombres cada una. Las mismas para todos hoy.`;

  return (
    <Card tone="tint" tint={palette.brandTint} onPress={() => router.push('/quiz')} accessibilityLabel={`Quiz diario. ${title}. ${sub}`}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: palette.brand }]}>
          <Icon name="eye" size={26} color={palette.onBrand} />
        </View>
        <View style={styles.flex}>
          <Txt variant="subheading">{title}</Txt>
          <Txt variant="small" tone="soft">
            {sub}
          </Txt>
          {!loading && streak > 0 ? (
            <Txt variant="label" tone="brand" style={styles.streak}>
              Racha de {streak} {streak === 1 ? 'día' : 'días'}
            </Txt>
          ) : null}
        </View>
        <Icon name="chevronRight" size={20} color={palette.inkFaint} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  badge: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  streak: { marginTop: space.xs },
});
