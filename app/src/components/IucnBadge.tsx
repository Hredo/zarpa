import { StyleSheet, View } from 'react-native';

import { IUCN_LABEL } from '@/lib/groups';
import { iucnColors, radius, space } from '@/theme';

import { Txt } from './Txt';

/** Categoría de la Lista Roja con los colores oficiales de la UICN. */
export function IucnBadge({ code, compact = false }: { code: string; compact?: boolean }) {
  const colors = iucnColors[code];
  if (!colors) return null;
  return (
    <View
      accessibilityLabel={`Lista Roja de la UICN: ${IUCN_LABEL[code] ?? code}`}
      style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Txt variant="label" color={colors.fg}>
        {code}
      </Txt>
      {!compact && (
        <Txt variant="small" color={colors.fg} style={styles.label}>
          {IUCN_LABEL[code]}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  label: { fontFamily: 'AtkinsonHyperlegibleNext_500Medium' },
});
