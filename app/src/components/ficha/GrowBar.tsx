import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { radius } from '@/theme';

import { useFill } from '../motion/useFill';

type Props = {
  /** 0–1 de la altura total. */
  value: number;
  height: number;
  color: string;
  trackColor?: string;
  delay?: number;
  /** Opacidad del color (para atenuar lo que no es lo destacado). */
  opacity?: number;
};

/**
 * Barra vertical que crece desde la base. Se mueve con `translateY` dentro de
 * un hueco recortado (solo transform: no recalcula el diseño).
 */
export function GrowBar({ value, height, color, trackColor, delay = 0, opacity = 1 }: Props) {
  const p = useFill(value, delay);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.get()) * height }] }));
  return (
    <View style={[styles.slot, { height, backgroundColor: trackColor ?? 'transparent' }]}>
      <Animated.View style={[styles.bar, { height, backgroundColor: color, opacity }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { overflow: 'hidden', borderRadius: radius.sm / 2, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.sm / 2 },
});
