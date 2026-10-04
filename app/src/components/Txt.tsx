import { Text, type TextProps, type TextStyle } from 'react-native';

import { type Palette, type as typeScale, usePalette } from '@/theme';

type Variant = keyof typeof typeScale;
type Tone = 'ink' | 'soft' | 'faint' | 'onForest' | 'onForestSoft' | 'onBlaze' | 'danger' | 'trailRed';

const TONE: Record<Tone, keyof Palette> = {
  ink: 'ink',
  soft: 'inkSoft',
  faint: 'inkFaint',
  onForest: 'onForest',
  onForestSoft: 'onForestSoft',
  onBlaze: 'onBlaze',
  danger: 'danger',
  trailRed: 'trailRed',
};

export type TxtProps = TextProps & {
  variant?: Variant;
  tone?: Tone;
  color?: string;
  align?: TextStyle['textAlign'];
  upper?: boolean;
};

/**
 * Texto con la escala tipográfica del sistema.
 *
 * Las variantes de rótulo (Big Shoulders) llevan un respiro a la derecha: en
 * Android las fuentes de expo-font se miden un pelo cortas y la última letra
 * de un rótulo condensado se recortaba (lección del TFG, misma pila).
 */
export function Txt({ variant = 'body', tone = 'ink', color, align, upper, style, children, ...rest }: TxtProps) {
  const palette = usePalette();
  const base = typeScale[variant];
  const isDisplay = variant === 'hero' || variant === 'title' || variant === 'heading' || variant === 'subheading';
  return (
    <Text
      {...rest}
      style={[
        base,
        { color: color ?? palette[TONE[tone]], textAlign: align },
        upper && { textTransform: 'uppercase' },
        isDisplay && { paddingRight: 2 },
        style,
      ]}>
      {children}
    </Text>
  );
}
