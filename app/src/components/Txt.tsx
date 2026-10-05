import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { fonts, type Palette, type as typeScale, usePalette } from '@/theme';

export type TxtVariant = keyof typeof typeScale;
export type TxtTone =
  | 'ink'
  | 'soft'
  | 'faint'
  | 'brand'
  | 'onBrand'
  | 'onStrong'
  | 'onStrongSoft'
  | 'onSun'
  | 'danger'
  | 'red'
  | 'sky';

const TONE: Record<TxtTone, keyof Palette> = {
  ink: 'ink',
  soft: 'inkSoft',
  faint: 'inkFaint',
  brand: 'brandInk',
  onBrand: 'onBrand',
  onStrong: 'onStrong',
  onStrongSoft: 'onStrongSoft',
  onSun: 'onSun',
  danger: 'danger',
  red: 'red',
  sky: 'sky',
};

export type TxtProps = TextProps & {
  variant?: TxtVariant;
  tone?: TxtTone;
  /** Color libre (p. ej. `groupColor(g).ink`); gana a `tone`. */
  color?: string;
  align?: TextStyle['textAlign'];
  upper?: boolean;
};

const DISPLAY = new Set<TxtVariant>(['hero', 'title', 'heading', 'subheading', 'stat']);

/**
 * Texto con la escala tipográfica del sistema.
 *
 * API: `<Txt variant="title" tone="soft">…</Txt>`.
 *   variant  hero · title · heading · subheading (Bricolage) · body · bodyStrong
 *            · sci (cursiva para nombres científicos) · label · small · data ·
 *            dataLarge (mono, solo medidas) · stat (cifra grande)
 *   tone     ink · soft · faint · brand · onBrand · onStrong · onStrongSoft ·
 *            onSun · danger · red · sky
 *
 * Los rótulos llevan un respiro a la derecha: en Android las fuentes de
 * expo-font se miden un pelo cortas y la última letra se recortaba.
 */
export function Txt({ variant = 'body', tone = 'ink', color, align, upper, style, children, ...rest }: TxtProps) {
  const palette = usePalette();
  const base = typeScale[variant] as TextStyle;
  // Bricolage no tiene cursiva: Android no la sintetiza e iOS la deforma. Los
  // nombres científicos piden cursiva, así que pasan a la Atkinson cursiva real.
  const italic = StyleSheet.flatten(style)?.fontStyle === 'italic';
  const bold = DISPLAY.has(variant) || variant === 'bodyStrong' || variant === 'label';
  return (
    <Text
      {...rest}
      style={[
        base,
        { color: color ?? palette[TONE[tone]], textAlign: align },
        upper && { textTransform: 'uppercase' },
        DISPLAY.has(variant) && { paddingRight: 2 },
        style,
        italic && { fontFamily: bold ? fonts.textBoldItalic : fonts.textItalic, fontStyle: 'normal' },
      ]}>
      {children}
    </Text>
  );
}
