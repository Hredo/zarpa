import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { monthName } from '@/lib/months';
import { radius, space, usePalette } from '@/theme';

/** Acceso a Inicio para el calendario de la naturaleza del mes en curso. */
export function CalendarCard() {
  const palette = usePalette();
  const month = monthName(new Date().getMonth() + 1);
  return (
    <Card tone="tint" tint={palette.sunTint} onPress={() => router.push('/calendario')} accessibilityLabel={`Calendario de la naturaleza: ${month}`}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: palette.surface }]}>
          <Icon name="calendar" size={26} color={palette.brandInk} />
        </View>
        <View style={styles.flex}>
          <Txt variant="subheading">{`Qué pasa en ${month}`}</Txt>
          <Txt variant="small" tone="soft">
            Especies en pico, novedades y migradoras de tu zona.
          </Txt>
        </View>
        <Icon name="chevronRight" size={20} color={palette.inkSoft} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
