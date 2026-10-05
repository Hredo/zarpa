import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { IUCN_LABEL } from '@/lib/groups';
import { iucnColors, radius, space, usePalette } from '@/theme';

import { useFill } from '../motion/useFill';
import { Txt } from '../Txt';

/** De menor a mayor riesgo, con los dos estados de extinción al final. */
const SCALE = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX'] as const;

function Cell({ code, current, index }: { code: string; current: boolean; index: number }) {
  const palette = usePalette();
  const c = iucnColors[code];
  // La casilla actual sube y crece un poco; las demás quedan como referencia.
  const p = useFill(current ? 1 : 0, 200 + index * 40);
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * p.get() }, { scale: 1 + 0.08 * p.get() }] }));
  return (
    <Animated.View style={[styles.cell, lift]}>
      <View
        style={[
          styles.box,
          { backgroundColor: current ? c.bg : palette.surface, borderColor: current ? palette.ink : palette.line, borderWidth: current ? 2 : 1 },
        ]}>
        <View style={[styles.swatch, { backgroundColor: c.bg, opacity: current ? 0 : 0.9 }]} />
        <Txt variant="label" color={current ? c.fg : palette.inkSoft} style={styles.code}>
          {code}
        </Txt>
      </View>
    </Animated.View>
  );
}

/**
 * Escala de la Lista Roja de la UICN en siete casillas, con la categoría de la
 * especie levantada, en su color oficial y con borde de tinta. DD («datos
 * insuficientes») no es un punto de la escala: se muestra aparte.
 */
export function IucnScale({ code }: { code: string }) {
  const palette = usePalette();
  const onScale = (SCALE as readonly string[]).includes(code);
  return (
    <View accessible accessibilityLabel={`Lista Roja de la UICN: ${IUCN_LABEL[code] ?? code}`}>
      {onScale ? (
        <>
          <View style={styles.row}>
            {SCALE.map((c, i) => (
              <Cell key={c} code={c} current={c === code} index={i} />
            ))}
          </View>
          <View style={styles.legend}>
            <Txt variant="small" tone="faint">
              Menor riesgo
            </Txt>
            <Txt variant="small" tone="faint">
              Extinta
            </Txt>
          </View>
        </>
      ) : (
        <View style={[styles.dd, { backgroundColor: iucnColors[code]?.bg ?? palette.surfaceAlt }]}>
          <Txt variant="label" color={iucnColors[code]?.fg ?? palette.ink}>
            {code}
          </Txt>
        </View>
      )}
      <Txt variant="subheading" style={styles.name}>
        {IUCN_LABEL[code] ?? code}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xs + 2, paddingTop: space.sm },
  cell: { flex: 1 },
  box: { height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  swatch: { position: 'absolute', left: 0, right: 0, top: 0, height: 5 },
  code: { letterSpacing: 0.4, marginTop: 3 },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  name: { marginTop: space.xs },
  dd: { alignSelf: 'flex-start', height: 36, minWidth: 56, paddingHorizontal: space.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
