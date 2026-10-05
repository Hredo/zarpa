import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, space, usePalette } from '@/theme';

import { Icon, type IconName } from './Icon';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { Txt } from './Txt';

type Props = {
  icon: IconName;
  /** Número (cuenta hasta él al aparecer) o texto ya formateado («1,2–1,6 m»). */
  value: number | string;
  label: string;
  /** Unidad tras un número («kg», «años»); se separa con un espacio fino. */
  unit?: string;
  decimals?: number;
  /** Color del icono; su fondo es `tint`. Por defecto azul noche sobre gris. */
  color?: string;
  tint?: string;
  /** Retardo del contador en ms (para escalonar una rejilla). */
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Dato de ficha: icono en su pastilla de color, cifra grande y rótulo. Para
 * rejillas de 2 o 3 columnas (tamaño, peso, longevidad, dieta…). No es un
 * «número héroe»: van siempre en grupo, con el mismo peso.
 *
 * API: `<StatTile icon="weight" value={4.2} decimals={1} unit="kg" label="Peso" color={g.color} tint={g.tint} />`
 */
export function StatTile({ icon, value, label, unit, decimals = 0, color, tint, delay = 0, style }: Props) {
  const palette = usePalette();
  const suffix = unit ? ` ${unit}` : '';
  return (
    <View style={[styles.tile, { backgroundColor: palette.surface, borderColor: palette.line }, style]} accessible accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}>
      <View style={[styles.badge, { backgroundColor: tint ?? palette.surfaceAlt }]}>
        <Icon name={icon} size={20} color={color ?? palette.ink} />
      </View>
      {typeof value === 'number' ? (
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} variant="stat" delay={delay} />
      ) : (
        <Txt variant="stat" numberOfLines={2}>
          {value}
          {suffix}
        </Txt>
      )}
      <Txt variant="small" tone="soft" numberOfLines={2}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: 96, padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: space.xs },
  badge: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
});
