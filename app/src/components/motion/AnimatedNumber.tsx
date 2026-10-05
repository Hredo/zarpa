import { useEffect } from 'react';
import { StyleSheet, TextInput, type TextStyle } from 'react-native';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { duration, ease, type as typeScale, usePalette } from '@/theme';

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/**
 * Formato es-ES que también corre en un worklet (Intl no existe en el hilo de
 * UI): coma decimal y punto de millar solo a partir de cinco cifras, como pide
 * la RAE y como `fmtInt` de lib/format.
 */
export function formatEs(n: number, decimals = 0): string {
  'worklet';
  const fixed = Math.abs(n).toFixed(decimals);
  const parts = fixed.split('.');
  let int = parts[0];
  if (int.length >= 5) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = n < 0 && Number(fixed) !== 0 ? '-' : '';
  return sign + (parts[1] ? `${int},${parts[1]}` : int);
}

type Props = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  variant?: keyof typeof typeScale;
  color?: string;
  /** Retardo en ms antes de empezar a contar (para escalonar con `Appear`). */
  delay?: number;
  style?: TextStyle;
};

/**
 * Cifra que cuenta hasta su valor al montar (700 ms, ease-out) y que, si el
 * valor cambia, cuenta desde el anterior. Corre entera en el hilo de UI (un
 * TextInput de solo lectura con `animatedProps`): React no re-renderiza por
 * fotograma. Con «reducir movimiento» muestra el valor sin contar.
 *
 * API: `<AnimatedNumber value={1234} suffix=" kg" variant="stat" color={g.ink} />`
 */
export function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '', variant = 'stat', color, delay = 0, style }: Props) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? value : 0);

  useEffect(() => {
    if (reduced) v.set(value);
    else v.set(withDelay(delay, withTiming(value, { duration: duration.fill, easing: ease.out })));
  }, [value, delay, reduced, v]);

  const animatedProps = useAnimatedProps(() => {
    const text = prefix + formatEs(v.get(), decimals) + suffix;
    return { text, defaultValue: text } as object;
  });

  const final = prefix + formatEs(value, decimals) + suffix;
  return (
    <AnimatedInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={final}
      accessibilityLabel={final}
      animatedProps={animatedProps}
      style={[typeScale[variant] as TextStyle, styles.input, { color: color ?? palette.ink }, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: { padding: 0, margin: 0, includeFontPadding: false },
});
