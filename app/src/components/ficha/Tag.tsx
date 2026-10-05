import { StyleSheet, View } from 'react-native';

import { radius, space, usePalette } from '@/theme';

import { Icon, type IconName } from '../Icon';
import { Txt } from '../Txt';

type Props = {
  label: string;
  icon?: IconName;
  /** Color del icono (tono pleno). */
  color?: string;
  /** Fondo suave. */
  tint?: string;
  /** Color del texto (tinta sobre `tint`). */
  ink?: string;
};

/**
 * Etiqueta informativa (no pulsable): icono en su color y texto sobre un
 * fondo suave. Para medio, dieta, reproducción, ambientes y nombres.
 */
export function Tag({ label, icon, color, tint, ink }: Props) {
  const palette = usePalette();
  return (
    <View style={[styles.tag, { backgroundColor: tint ?? palette.surfaceAlt }]} accessible accessibilityLabel={label}>
      {icon ? <Icon name={icon} size={18} color={color ?? palette.inkSoft} /> : null}
      <Txt variant="label" color={ink ?? palette.ink} style={styles.text}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, minHeight: 34, paddingHorizontal: space.md, borderRadius: radius.pill, alignSelf: 'flex-start' },
  text: { flexShrink: 1 },
});
