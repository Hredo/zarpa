import { StyleSheet, View } from 'react-native';

import { GROUP_BY_CODE, type GroupCode } from '@/lib/groups';
import { groupColor, radius, space } from '@/theme';

import { Icon } from './Icon';
import { Txt } from './Txt';

type Props = {
  code: GroupCode | string;
  /** `sm`: 26 pt para tarjetas · `md`: 32 pt para cabeceras de ficha. */
  size?: 'sm' | 'md';
  /** `singular` («Ave») o `plural` («Aves»). */
  form?: 'singular' | 'plural';
  /** Solo el icono en su pastilla de color (para tarjetas estrechas). */
  iconOnly?: boolean;
};

/**
 * Pastilla de grupo animal con su color: icono en el tono pleno y nombre en la
 * tinta del grupo sobre su `tint`. Orienta de un vistazo en todo el álbum.
 *
 * API: `<GroupPill code={species.grp} />` · `<GroupPill code="ave" size="md" form="plural" />`
 */
export function GroupPill({ code, size = 'sm', form = 'singular', iconOnly = false }: Props) {
  const g = groupColor(code);
  const meta = GROUP_BY_CODE[code as GroupCode] ?? GROUP_BY_CODE.otro;
  const name = form === 'plural' ? meta.label : meta.singular;
  const h = size === 'sm' ? 26 : 32;
  return (
    <View
      accessible
      accessibilityLabel={name}
      style={[
        styles.pill,
        { backgroundColor: g.tint, height: h, paddingHorizontal: iconOnly ? 0 : size === 'sm' ? space.sm : space.md, width: iconOnly ? h : undefined },
      ]}>
      <Icon name={meta.code} size={size === 'sm' ? 16 : 20} color={g.color} strokeWidth={2} />
      {iconOnly ? null : (
        <Txt variant="label" color={g.ink} numberOfLines={1} style={size === 'sm' ? styles.smText : undefined}>
          {name}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
  smText: { fontSize: 12, lineHeight: 15 },
});
