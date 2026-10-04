import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, ease, PRESS_SCALE } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** Vibración ligera al confirmar; solo para acciones con consecuencia. */
  haptic?: boolean;
  scaleTo?: number;
};

/**
 * Todo lo que se toca responde al apoyar el dedo, no al levantarlo: escala a
 * 0,97 en 120 ms con curva de salida. Sin muelles (no rebota al soltar).
 */
export function Press({ style, children, haptic, scaleTo = PRESS_SCALE, onPressIn, onPressOut, onPress, ...rest }: Props) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      {...rest}
      hitSlop={rest.hitSlop ?? 6}
      pressRetentionOffset={{ top: 16, left: 16, right: 16, bottom: 16 }}
      onPressIn={(e) => {
        if (!reduced) scale.set(withTiming(scaleTo, { duration: duration.press, easing: ease.out }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, { duration: duration.press, easing: ease.out }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={[style, animated]}>
      {children}
    </AnimatedPressable>
  );
}
