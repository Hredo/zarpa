import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, space, usePalette, type GroupColor } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { Txt } from './Txt';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Recuento a la derecha («Aves 214»). */
  count?: string | number;
  /**
   * Color de grupo: el chip lleva el icono en su color y, seleccionado, se
   * rellena con su `tint` y su borde. Sin él, seleccionado = azul noche.
   */
  color?: GroupColor;
  /** Adorno propio a la izquierda (marca de sendero, punto de la UICN…); sustituye a `icon`. */
  leading?: ReactNode;
  accessibilityLabel?: string;
};

/**
 * Chip de filtro o de opción. 40 pt de alto visibles y área táctil de 48.
 * Cambiar de estado no anima nada (se toca decenas de veces por sesión): solo
 * la pulsación con escala de `Press`.
 *
 * API: `<Chip label="Aves" icon="ave" color={groupColors.ave} selected={on} onPress={toggle} count={214} />`
 */
export function Chip({ label, selected = false, onPress, icon, count, color, leading, accessibilityLabel }: Props) {
  const palette = usePalette();
  const bg = selected ? (color ? color.tint : palette.strong) : palette.surface;
  const border = selected ? (color ? color.color : palette.strong) : palette.line;
  const fg = selected ? (color ? color.ink : palette.onStrong) : palette.ink;
  const iconColor = selected ? fg : (color?.color ?? palette.inkSoft);
  const countColor = selected ? (color ? color.ink : palette.onStrongSoft) : palette.inkFaint;

  return (
    <Press
      onPress={onPress}
      disabled={!onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.chip, { backgroundColor: bg, borderColor: border, borderWidth: selected && color ? 1.5 : 1 }]}>
      {leading ?? (icon ? <Icon name={icon} size={18} color={iconColor} /> : null)}
      <Txt variant="label" color={fg} numberOfLines={1}>
        {label}
      </Txt>
      {count !== undefined ? (
        <View>
          <Txt variant="data" color={countColor}>
            {count}
          </Txt>
        </View>
      ) : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
});
