import { useEffect } from 'react';
import { useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';

import { duration, ease } from '@/theme';

/**
 * Progreso 0–1 que se llena hasta `value` al montar (700 ms, ease-out) y se
 * desplaza al nuevo valor si cambia. Con «reducir movimiento» salta al valor.
 * Es la base de `Meter` y de cualquier barra o anillo propio.
 *
 * API: `const p = useFill(0.42, 120);` y luego `p.get()` en un `useAnimatedStyle`.
 */
export function useFill(value: number, delay = 0): SharedValue<number> {
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const p = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    if (reduced) p.set(target);
    else p.set(withDelay(delay, withTiming(target, { duration: duration.fill, easing: ease.out })));
  }, [target, delay, reduced, p]);
  return p;
}
