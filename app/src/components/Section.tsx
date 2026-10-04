import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space, usePalette } from '@/theme';

import { Txt } from './Txt';

/**
 * Bloque de la ficha: rótulo de cartel y un filete grueso, como los paneles de
 * los centros de interpretación. Más aire encima que debajo del título.
 */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Txt variant="heading">{title}</Txt>
        {aside}
      </View>
      <View style={[styles.rule, { backgroundColor: palette.ink }]} />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.xxl },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  rule: { height: 3, marginTop: space.xs, width: 44 },
  body: { marginTop: space.lg },
});
