import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { waveformBars } from '@/lib/sounds';
import { duration, ease, radius } from '@/theme';

type Props = {
  /** Semilla estable (id del sonido) para que cada grabación tenga su dibujo. */
  seed: number;
  /** 0–1: la parte ya reproducida se pinta en el color pleno. */
  progress: number;
  playing: boolean;
  color: string;
  height?: number;
};

const H = 64;

function Bar({
  base,
  phase,
  t,
  amp,
  color,
  played,
  height,
}: {
  base: number;
  phase: number;
  t: SharedValue<number>;
  amp: SharedValue<number>;
  color: string;
  played: boolean;
  height: number;
}) {
  // Con el sonido en marcha cada barra respira a su ritmo; en pausa se asienta.
  const style = useAnimatedStyle(() => {
    const wob = 0.5 + 0.5 * Math.sin((t.get() + phase) * 2 * Math.PI);
    return { transform: [{ scaleY: base * (1 - amp.get() * 0.55 * (1 - wob)) }] };
  });
  return (
    <View style={[styles.slot, { height }]}>
      <Animated.View style={[styles.bar, { height, backgroundColor: color, opacity: played ? 1 : 0.35 }, style]} />
    </View>
  );
}

/**
 * Forma de onda del reproductor: barras del color del grupo que se llenan según
 * avanza la grabación y se mueven mientras suena. Es un dibujo ilustrativo
 * (no el espectro real), estable por sonido. Con «reducir movimiento» solo
 * avanza el relleno.
 */
export function Waveform({ seed, progress, playing, color, height = H }: Props) {
  const reduced = useReducedMotion();
  const bars = useMemo(() => waveformBars(seed), [seed]);
  const t = useSharedValue(0);
  const amp = useSharedValue(0);

  useEffect(() => {
    const live = playing && !reduced;
    if (live) {
      t.set(withRepeat(withTiming(1, { duration: 1700, easing: Easing.linear }), -1, false));
    } else {
      cancelAnimation(t);
    }
    amp.set(withTiming(live ? 1 : 0, { duration: duration.small, easing: ease.out }));
  }, [playing, reduced, t, amp]);

  const playedCount = Math.round(progress * bars.length);
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bars.map((b, i) => (
        <Bar key={i} base={b} phase={(i * 0.37) % 1} t={t} amp={amp} color={color} played={i < playedCount} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  slot: { flex: 1, justifyContent: 'center' },
  bar: { width: '100%', borderRadius: radius.sm / 2, minHeight: 4 },
});
