import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { radius, space, usePalette } from '@/theme';

import { useFill } from './motion/useFill';
import { Txt } from './Txt';

type Props = {
  /** Progreso 0–1 (se recorta). */
  value: number;
  /** Color del relleno (p. ej. `groupColor(g).color` o `palette.leaf`). */
  color?: string;
  /** Color de la pista; por defecto `surfaceAlt`. */
  trackColor?: string;
  height?: number;
  /** Rótulo a la izquierda, encima de la barra. */
  label?: string;
  /** Valor legible a la derecha («72 %», «3 de 10»). */
  valueLabel?: string;
  /** Retardo en ms antes de llenarse (para escalonar varias barras). */
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Barra que se llena hasta su valor al aparecer (700 ms, ease-out, sin
 * rebote) y se desplaza si el valor cambia. El relleno mide lo que la pista y
 * se mueve con `translateX` (solo transform: no recalcula el diseño), así que
 * conserva sus esquinas redondeadas a cualquier valor.
 *
 * API: `<Meter value={0.62} color={palette.leaf} label="Avistadas" valueLabel="62 %" />`
 */
export function Meter({ value, color, trackColor, height = 10, label, valueLabel, delay = 0, style }: Props) {
  const palette = usePalette();
  const [w, setW] = useState(0);
  const p = useFill(value, delay);
  const fill = useAnimatedStyle(() => ({
    opacity: w > 0 ? 1 : 0,
    transform: [{ translateX: -(1 - p.get()) * w }],
  }));
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);

  return (
    <View style={style} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} accessibilityLabel={label}>
      {label || valueLabel ? (
        <View style={styles.head}>
          {label ? (
            <Txt variant="label" tone="soft" style={styles.flex} numberOfLines={1}>
              {label}
            </Txt>
          ) : (
            <View style={styles.flex} />
          )}
          {valueLabel ? (
            <Txt variant="label" tone="ink">
              {valueLabel}
            </Txt>
          ) : null}
        </View>
      ) : null}
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor ?? palette.surfaceAlt }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: height / 2, backgroundColor: color ?? palette.strong }, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginBottom: space.xs + 2 },
  flex: { flex: 1 },
  track: { overflow: 'hidden', borderRadius: radius.pill },
});
