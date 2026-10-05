import { StyleSheet, View } from 'react-native';
import Svg, { Ellipse, G, Path } from 'react-native-svg';

import { usePalette } from '@/theme';

import { Txt } from './Txt';

/*
 * Marca de Zarpa: la huella de una zarpa (almohadilla trilobulada + cuatro
 * dedos en abanico), girada -12° como si estuviera dando un paso. Con
 * `sticker` lleva el borde blanco troquelado de las pegatinas del álbum.
 *
 * Es la misma geometría que scripts/make_icons.py usa para los PNG del icono,
 * la splash y el favicon: si cambias una, cambia la otra.
 */

export const PAD_D =
  'M50 53C58.5 53 63.5 58 67.5 63.5C71.5 69 78 71.5 78 78.5C78 84.5 73 88 67 87.5C62 87 57 84.5 50 84.5C43 84.5 38 87 33 87.5C27 88 22 84.5 22 78.5C22 71.5 28.5 69 32.5 63.5C36.5 58 41.5 53 50 53Z';

/** cx, cy, rx, ry, giro (grados). */
export const TOES: [number, number, number, number, number][] = [
  [38.5, 34, 8.2, 10.8, -12],
  [61.5, 34, 8.2, 10.8, 12],
  [20.5, 49, 7.2, 9.4, -36],
  [79.5, 49, 7.2, 9.4, 36],
];

/** Giro y centrado de la huella en la rejilla de 100. */
export const PAW_TRANSFORM = 'translate(0 -6) rotate(-12 50 55)';

type GlyphProps = { fill?: string; stroke?: string; strokeWidth?: number };

/** Huella en la rejilla de 100 × 100, para usar dentro de un <Svg>. */
export function PawGlyph({ fill = 'none', stroke, strokeWidth = 0 }: GlyphProps) {
  const common = { fill, stroke, strokeWidth, strokeLinejoin: 'round' as const };
  return (
    <G transform={PAW_TRANSFORM}>
      <Path d={PAD_D} {...common} />
      {TOES.map(([cx, cy, rx, ry, g]) => (
        <Ellipse key={`${cx}`} cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${g} ${cx} ${cy})`} {...common} />
      ))}
    </G>
  );
}

type Tone = 'brand' | 'ink' | 'white';

type Props = {
  /** `mark`: solo la huella. `full`: huella + «Zarpa». */
  variant?: 'mark' | 'full';
  /** Alto de la marca en pt. */
  size?: number;
  tone?: Tone;
  /** Borde blanco troquelado, para ponerla sobre color o foto. */
  sticker?: boolean;
};

/**
 * API: `<Logo />` (huella mandarina de 40 pt) · `<Logo variant="full" size={32} />`
 * · `<Logo tone="ink" sticker />` sobre mandarina. El texto del logotipo usa
 * Bricolage 800 en azul noche (blanco si `tone="white"`).
 */
export function Logo({ variant = 'mark', size = 40, tone = 'brand', sticker = false }: Props) {
  const palette = usePalette();
  const color = tone === 'brand' ? palette.brand : tone === 'ink' ? palette.ink : '#FFFFFF';
  const mark = (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={variant === 'mark'} accessibilityLabel="Zarpa">
      {sticker ? <PawGlyph fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={16} /> : null}
      <PawGlyph fill={color} />
    </Svg>
  );
  if (variant === 'mark') return mark;
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="Zarpa">
      {mark}
      <Txt
        variant="title"
        color={tone === 'white' ? '#FFFFFF' : palette.ink}
        style={{ fontSize: size * 0.82, lineHeight: size, letterSpacing: -size * 0.025 }}>
        Zarpa
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
