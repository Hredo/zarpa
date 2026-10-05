import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { usePalette } from '@/theme';

import { Txt } from './Txt';

type Props = {
  /** Foto de la cuenta. Sin ella se usan las iniciales. */
  uri?: string | null;
  /** Alias o nombre: de él salen las iniciales. Vacío = silueta. */
  name?: string | null;
  size?: number;
};

/** Hasta dos iniciales de un nombre («Ana María Ruiz» → «AM»). */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Avatar redondo: foto de la cuenta, iniciales sobre mandarina (tinta azul
 * noche encima, como pide el sistema) o una silueta si no hay cuenta.
 *
 * API: `<Avatar uri={user.photoURL} name={alias} size={96} />`
 */
export function Avatar({ uri, name, size = 40 }: Props) {
  const palette = usePalette();
  const letters = initials(name);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[box, { backgroundColor: palette.surfaceAlt }]} contentFit="cover" transition={180} accessibilityIgnoresInvertColors />;
  }
  if (letters) {
    return (
      <View style={[styles.center, box, { backgroundColor: palette.brand }]}>
        <Txt variant="subheading" tone="onBrand" style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
          {letters}
        </Txt>
      </View>
    );
  }
  return (
    <View style={[styles.center, box, { backgroundColor: palette.surfaceAlt }]}>
      <Svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
        <Circle cx={12} cy={8.5} r={4} fill={palette.inkFaint} />
        <Path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill={palette.inkFaint} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
