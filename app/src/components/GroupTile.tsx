import { StyleSheet, View } from 'react-native';

import { GROUP_BY_CODE, type GroupCode } from '@/lib/groups';
import { fmtInt } from '@/lib/format';
import { groupColor, radius, space, usePalette } from '@/theme';

import { Icon } from './Icon';
import { Press } from './Press';
import { Txt } from './Txt';

type Props = {
  code: GroupCode;
  /** Especies del grupo (opcional, bajo el nombre). */
  total?: number;
  onPress: (code: GroupCode) => void;
  width: number;
};

/**
 * Acceso rápido a un grupo animal: baldosa con el tinte del grupo, su icono en
 * el tono pleno y el nombre en su tinta. Área táctil entera ≥ 48 pt.
 *
 * API: `<GroupTile code="ave" total={11000} width={w} onPress={(c) => …} />`
 */
export function GroupTile({ code, total, onPress, width }: Props) {
  const palette = usePalette();
  const g = groupColor(code);
  const meta = GROUP_BY_CODE[code];
  return (
    <Press
      onPress={() => onPress(code)}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label}${total ? `, ${fmtInt(total)} especies` : ''}`}
      style={[styles.tile, { width, backgroundColor: g.tint }]}>
      <View style={[styles.disc, { backgroundColor: palette.surface }]}>
        <Icon name={code} size={26} color={g.color} strokeWidth={2} />
      </View>
      <Txt variant="label" color={g.ink} numberOfLines={2} style={styles.name}>
        {meta.label}
      </Txt>
      {total ? (
        <Txt variant="data" color={g.ink}>
          {fmtInt(total)}
        </Txt>
      ) : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  tile: { minHeight: 104, padding: space.md, borderRadius: radius.lg, gap: space.xs, justifyContent: 'flex-start' },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  name: { fontSize: 13, lineHeight: 16 },
});
