import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { elevation, HIT, radius, space, usePalette } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { Txt } from './Txt';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Inicio', icon: 'rastro' },
  bestiario: { label: 'Bestiario', icon: 'bestiario' },
  atlas: { label: 'Atlas', icon: 'atlas' },
  cuaderno: { label: 'Cuaderno', icon: 'cuaderno' },
};

/*
 * Barra de pestañas clara: cuatro secciones con icono y nombre siempre
 * visibles y, en el centro, el botón de Avistar, que es la acción de la app y
 * no una sección más: una pegatina mandarina con borde blanco que sobresale de
 * la barra y abre el visor a pantalla completa.
 *
 * La pestaña activa se marca con una pastilla azul noche suave detrás del
 * icono, el icono en tinta y el nombre en negrita: tres señales, ninguna solo
 * de color. Cambiar de pestaña no anima nada (son pares, no una jerarquía, y
 * se hace decenas de veces por sesión).
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const palette = usePalette();
  const routes = state.routes.filter((r) => TABS[r.name]);
  const half = Math.ceil(routes.length / 2);

  const renderTab = (route: (typeof routes)[number]) => {
    const meta = TABS[route.name];
    const index = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;
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
        <View style={[styles.pill, focused && { backgroundColor: palette.strongTint }]}>
          <Icon name={meta.icon} color={focused ? palette.ink : palette.inkFaint} size={24} strokeWidth={focused ? 2.2 : 1.9} />
        </View>
        <Txt variant="label" color={focused ? palette.ink : palette.inkFaint} style={[styles.label, !focused && styles.labelIdle]}>
          {meta.label}
        </Txt>
      </Press>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        elevation.raised,
        { backgroundColor: palette.surface, borderTopColor: palette.line, paddingBottom: Math.max(insets.bottom, space.sm) },
      ]}>
      {routes.slice(0, half).map(renderTab)}
      <View style={styles.centerSlot}>
        <Press
          haptic
          accessibilityRole="button"
          accessibilityLabel="Avistar un animal con la cámara"
          onPress={() => router.push('/avistar')}
          style={[styles.scan, elevation.raised, { backgroundColor: palette.brand, borderColor: palette.surface }]}>
          <Icon name="avistar" size={30} color={palette.onBrand} strokeWidth={2.3} />
        </Press>
        <Txt variant="label" tone="ink" style={styles.label}>
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
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: HIT + 8, gap: 2 },
  pill: { width: 56, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, lineHeight: 15 },
  labelIdle: { fontFamily: 'AtkinsonHyperlegibleNext_500Medium' },
  centerSlot: { width: 84, alignItems: 'center', gap: 2 },
  scan: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
  },
});
