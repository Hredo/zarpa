import { StyleSheet, View } from 'react-native';

import type { Rank, Verdict } from '@/ai/decision';
import { fmt1 } from '@/lib/format';
import { space } from '@/theme';

import { Txt } from '../Txt';

const STEPS: { rank: Rank; label: string }[] = [
  { rank: 'class', label: 'Clase' },
  { rank: 'order', label: 'Orden' },
  { rank: 'family', label: 'Familia' },
  { rank: 'genus', label: 'Género' },
  { rank: 'species', label: 'Especie' },
];

type Props = {
  verdict: Verdict | null;
  speciesName: string | null;
  names: Partial<Record<Rank, string | null>>;
};

/*
 * La escalera en vivo: cada peldaño se enciende cuando la probabilidad
 * acumulada de ese nivel supera su umbral calibrado. Un peldaño gris con
 * porcentaje es una pista, no una afirmación; uno blanco es lo que la app se
 * atreve a decir. Es la misma lógica que decide el fichaje.
 */
export function LadderHud({ verdict, speciesName, names }: Props) {
  const reached = verdict?.level ? STEPS.findIndex((s) => s.rank === verdict.level) : -1;
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      {STEPS.map((step, i) => {
        const on = i <= reached;
        const guess = verdict?.ladder[step.rank];
        const label =
          step.rank === 'species' ? (on ? speciesName : null) : (names[step.rank] ?? guess?.name ?? null);
        return (
          <View key={step.rank} style={[styles.step, on ? styles.stepOn : styles.stepOff]}>
            <Txt variant="data" color={on ? '#0F1A14' : 'rgba(255,255,255,0.7)'} style={styles.rank}>
              {step.label}
            </Txt>
            <Txt
              variant="label"
              color={on ? '#0F1A14' : 'rgba(255,255,255,0.86)'}
              numberOfLines={1}
              style={styles.name}>
              {label ?? '—'}
            </Txt>
            {guess && !on ? (
              <Txt variant="data" color="rgba(255,255,255,0.7)">
                {fmt1(guess.p * 100)} %
              </Txt>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 4, paddingHorizontal: space.md },
  step: { flex: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 5, minHeight: 56 },
  stepOn: { backgroundColor: '#F5C400' },
  stepOff: { backgroundColor: 'rgba(8,14,10,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  rank: { fontSize: 10, lineHeight: 12 },
  name: { fontSize: 12, lineHeight: 15, marginTop: 2 },
});
