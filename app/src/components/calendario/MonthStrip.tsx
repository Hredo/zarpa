import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { GrowBar } from '@/components/ficha/GrowBar';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { MONTHS_LONG, MONTHS_SHORT } from '@/lib/months';
import { duration, ease, radius, space, usePalette } from '@/theme';

type Props = {
  /** Actividad relativa 0–1 de cada mes (12 valores) o null mientras carga. */
  activity: number[] | null;
  selected: number; // 1–12
  current: number; // mes de hoy, 1–12
  onSelect: (month: number) => void;
};

const H = 72;

/**
 * Tira de 12 meses. La altura de cada barra es la actividad de observación de
 * la región; un recuadro de selección se desliza hasta el mes elegido (ease
 * in-out, 260 ms) y la barra de hoy lleva un punto. Cambiar de mes se hace unas
 * pocas veces por visita, así que el deslizamiento cabe; con «reducir
 * movimiento» salta.
 */
export function MonthStrip({ activity, selected, current, onSelect }: Props) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const cell = w / 12;
  const x = useSharedValue((selected - 1) * cell);

  useEffect(() => {
    const to = (selected - 1) * cell;
    if (reduced || cell === 0) x.set(to);
    else x.set(withTiming(to, { duration: duration.enter, easing: ease.inOut }));
  }, [selected, cell, reduced, x]);

  const box = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={styles.wrap}>
      {cell > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.box, { width: cell, backgroundColor: palette.strongTint }, box]} />
      ) : null}
      {MONTHS_SHORT.map((m, i) => {
        const month = i + 1;
        const on = month === selected;
        return (
          <Press
            key={m}
            onPress={() => onSelect(month)}
            scaleTo={0.94}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${MONTHS_LONG[i]}${month === current ? ' (este mes)' : ''}`}
            style={styles.cell}>
            <GrowBar value={activity ? activity[i] : 0} height={H} color={on ? palette.brand : palette.sky} opacity={on ? 1 : 0.45} delay={i * 35} />
            <Txt variant="data" color={on ? palette.ink : palette.inkFaint} style={styles.lab}>
              {m}
            </Txt>
            <View style={[styles.dot, { backgroundColor: month === current ? palette.brand : 'transparent' }]} />
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', paddingVertical: space.sm },
  box: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.md },
  cell: { flex: 1, paddingHorizontal: 3, alignItems: 'stretch', minHeight: 48 },
  lab: { textAlign: 'center', marginTop: 4, fontSize: 11 },
  dot: { alignSelf: 'center', width: 5, height: 5, borderRadius: 3, marginTop: 3 },
});
