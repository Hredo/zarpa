import { StyleSheet, View } from 'react-native';

import { IUCN_LABEL } from '@/lib/groups';
import { fonts, iucnColors, radius, space } from '@/theme';

import { Txt } from './Txt';

/**
 * Categoría de la Lista Roja con los colores oficiales de la UICN (notación
 * real que el usuario se encuentra fuera de la app: no se recolorea).
 *
 * API: `<IucnBadge code="EN" />` (código + nombre) · `<IucnBadge code="EN" compact />` (solo código).
 */
export function IucnBadge({ code, compact = false }: { code: string; compact?: boolean }) {
  const colors = iucnColors[code];
  if (!colors) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Lista Roja de la UICN: ${IUCN_LABEL[code] ?? code}`}
      style={[styles.badge, compact && styles.compact, { backgroundColor: colors.bg }]}>
      <Txt variant="label" color={colors.fg} style={styles.code}>
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
    minHeight: 28,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  compact: { minHeight: 22, paddingHorizontal: space.sm },
  code: { letterSpacing: 0.6 },
  label: { fontFamily: fonts.textMedium },
});
