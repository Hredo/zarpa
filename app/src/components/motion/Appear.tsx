import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { duration, ease, ENTER_DISTANCE, stagger } from '@/theme';

type Props = {
  /** Posición en la lista: retrasa `index × 45 ms`. A partir de 8 aparece sin animar. */
  index?: number;
  /** Retardo extra en ms (p. ej. para que una sección entre después de la cabecera). */
  delay?: number;
  /** `below`: sube 12 px mientras aparece · `scale`: crece desde 0,96 · `none`: solo fundido. */
  from?: 'below' | 'scale' | 'none';
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Entrada escalonada de tarjetas y bloques al montar: fundido + desplazamiento
 * corto con ease-out (300 ms), sin muelle. Pensada para pantallas que se abren
 * pocas veces por sesión (fichas, resúmenes, logros), no para filas de listas
 * virtualizadas que se reciclan al hacer scroll: ahí se anima el contenedor.
 *
 * Con «reducir movimiento» solo funde, sin desplazamiento ni escala.
 *
 * API: `{items.map((it, i) => <Appear key={it.id} index={i}>…</Appear>)}`
 */
export function Appear({ index = 0, delay = 0, from = 'below', style, children }: Props) {
  const reduced = useReducedMotion();
  const animate = index < stagger.max;
  const p = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    const wait = delay + index * stagger.step;
    p.set(withDelay(wait, withTiming(1, { duration: reduced ? duration.small : duration.enter + 40, easing: ease.out })));
  }, [animate, delay, index, p, reduced]);

  const animated = useAnimatedStyle(() => {
    const v = p.get();
    if (reduced || from === 'none') return { opacity: v };
    if (from === 'scale') return { opacity: v, transform: [{ scale: 0.96 + 0.04 * v }] };
    return { opacity: v, transform: [{ translateY: (1 - v) * ENTER_DISTANCE }] };
  });

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
