import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { useExcursion } from '@/store/excursion';
import { radius, space, usePalette } from '@/theme';

/**
 * Acceso a Inicio para el modo excursión. Si hay una salida abierta lo dice y
 * cuenta cuántos objetivos lleva; si no, invita a preparar la de hoy.
 */
export function ExcursionCard() {
  const palette = usePalette();
  const { loaded, active, targets } = useExcursion();
  useEffect(() => {
    if (!loaded) void useExcursion.getState().load();
  }, [loaded]);
  const seen = targets.filter((t) => t.seen).length;

  return (
    <Card tone="tint" tint={palette.leafTint} onPress={() => router.push('/excursion')} accessibilityLabel={active ? 'Excursión en curso' : 'Preparar una excursión'}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: palette.surface }]}>
          <Icon name="flag" size={26} color={palette.leaf} />
        </View>
        <View style={styles.flex}>
          <Txt variant="subheading">{active ? 'Excursión en curso' : 'Salir al campo'}</Txt>
          <Txt variant="small" tone="soft">
            {active ? `${seen} de ${targets.length} objetivos vistos` : 'Qué puedes ver hoy aquí, según el mes y la hora.'}
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
