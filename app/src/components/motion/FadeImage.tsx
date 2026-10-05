import { Image, type ImageProps } from 'expo-image';
import { useReducedMotion } from 'react-native-reanimated';

import { duration, usePalette } from '@/theme';

/**
 * Imagen que aparece con un fundido corto (260 ms, ease-out) al terminar de
 * cargar, sobre un hueco de color para que nada salte. Es expo-image con su
 * transición nativa: no cuesta nada en el hilo de JS. Con «reducir
 * movimiento» el fundido baja a 120 ms.
 *
 * API: la de `Image` de expo-image + `placeholderColor` (color del hueco, por
 * defecto `surfaceAlt`; p. ej. el `tint` del grupo):
 * `<FadeImage source={url} style={…} contentFit="cover" placeholderColor={g.tint} />`
 */
export function FadeImage({ style, transition, placeholderColor, ...rest }: ImageProps & { placeholderColor?: string }) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  return (
    <Image
      {...rest}
      transition={transition ?? { duration: reduced ? duration.press : duration.enter, effect: 'cross-dissolve', timing: 'ease-out' }}
      style={[{ backgroundColor: placeholderColor ?? palette.surfaceAlt }, style]}
    />
  );
}
