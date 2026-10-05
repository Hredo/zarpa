import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { elevation, radius, space, usePalette } from '@/theme';

import { Press } from './Press';

type Props = {
  children: ReactNode;
  /** Si existe, la tarjeta entera es pulsable (escala 0,97). */
  onPress?: () => void;
  /**
   * `plain`: blanca con sombra suave (por defecto) · `tint`: plana sobre un
   * color suave (`tint`, p. ej. el del grupo) · `outline`: blanca con filete.
   */
  tone?: 'plain' | 'tint' | 'outline';
  /** Fondo para `tone="tint"`. */
  tint?: string;
  /** Relleno interior (clave de `space`); por defecto `lg` (16). */
  padding?: keyof typeof space | 0;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * Contenedor base de las fichas: radio de 18, relleno de 16. Nunca una
 * tarjeta dentro de otra: dentro de una Card se agrupa con espacio y filetes.
 *
 * API: `<Card tone="tint" tint={g.tint} onPress={…}>…</Card>`
 */
export function Card({ children, onPress, tone = 'plain', tint, padding = 'lg', style, accessibilityLabel }: Props) {
  const palette = usePalette();
  const look: ViewStyle =
    tone === 'tint'
      ? { backgroundColor: tint ?? palette.surfaceAlt }
      : tone === 'outline'
        ? { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line }
        : { backgroundColor: palette.surface, ...elevation.card };
  const base: ViewStyle = { borderRadius: radius.lg, padding: padding === 0 ? 0 : space[padding] };
  if (onPress) {
    return (
      <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[base, look, style]}>
        {children}
      </Press>
    );
  }
  return <View style={[base, look, style]}>{children}</View>;
}
