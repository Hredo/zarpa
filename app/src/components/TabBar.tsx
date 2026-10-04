import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { HIT, space, usePalette } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { Txt } from './Txt';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Rastro', icon: 'rastro' },
  bestiario: { label: 'Bestiario', icon: 'bestiario' },
  atlas: { label: 'Atlas', icon: 'atlas' },
  cuaderno: { label: 'Cuaderno', icon: 'cuaderno' },
};

/*
 * Barra de pestañas propia: cuatro secciones y, en el centro, el botón de
 * Avistar, que es la acción de la app y no una sección más. Por eso no es una
 * pestaña: abre el visor a pantalla completa por encima de todo.
 *
 * Cambiar de pestaña no anima nada (son pares, no una jerarquía, y se hace
 * decenas de veces por sesión).
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const palette = usePalette();
  const routes = state.routes.filter((r) => TABS[r.name]);
  const half = Math.ceil(routes.length / 2);

  const renderTab = (route: (typeof routes)[number]) => {
    const meta = TABS[route.name];
    const index = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;
    const color = focused ? palette.ink : palette.inkFaint;
    return (
      <Press
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        style={styles.tab}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}>
        <Icon name={meta.icon} color={color} size={24} />
        <Txt variant="label" color={color} style={styles.label}>
          {meta.label}
        </Txt>
        <View style={[styles.mark, { backgroundColor: focused ? palette.trailRed : 'transparent' }]} />
      </Press>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: palette.surface, borderTopColor: palette.line, paddingBottom: Math.max(insets.bottom, space.sm) },
      ]}>
      {routes.slice(0, half).map(renderTab)}
      <View style={styles.centerSlot}>
        <Press
          haptic
          accessibilityRole="button"
          accessibilityLabel="Avistar un animal"
          onPress={() => router.push('/avistar')}
          style={[styles.scan, { backgroundColor: palette.blaze, borderColor: palette.ink }]}>
          <Icon name="avistar" size={30} color={palette.onBlaze} strokeWidth={2.2} />
        </Press>
        <Txt variant="label" tone="ink" style={styles.scanLabel}>
          Avistar
        </Txt>
      </View>
      {routes.slice(half).map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: HIT, gap: 3 },
  label: { fontSize: 11, lineHeight: 13 },
  mark: { width: 14, height: 3, borderRadius: 1, marginTop: 2 },
  centerSlot: { width: 84, alignItems: 'center', gap: 4 },
  scan: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
  },
  scanLabel: { fontSize: 11, lineHeight: 13, marginBottom: 5 },
});
