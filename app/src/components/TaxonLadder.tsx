import { StyleSheet, View } from 'react-native';

import { radius, space, usePalette, type GroupColor } from '@/theme';

import { Appear } from './motion/Appear';
import { Txt } from './Txt';

export type Rung = { rank: string; sci: string | null; es?: string | null };

const RANK_ES: Record<string, string> = {
  kingdom: 'Reino',
  phylum: 'Filo',
  class: 'Clase',
  order: 'Orden',
  family: 'Familia',
  genus: 'Género',
  species: 'Especie',
};

/**
 * La escalera taxonómica: de reino a especie, cada peldaño con su nombre
 * científico y, si existe, el común. Es la misma escalera que el visor va
 * llenando en tiempo real al reconocer un animal, para que la ficha y la
 * cámara hablen el mismo idioma.
 */
export function TaxonLadder({
  rungs,
  reached,
  variant = 'rail',
  color,
}: {
  rungs: Rung[];
  reached?: number;
  /**
   * `rail`: línea vertical con nodos (visor de cámara) · `steps`: peldaños de
   * color escalonados (ficha); `color` es el del grupo.
   */
  variant?: 'rail' | 'steps';
  color?: GroupColor;
}) {
  const palette = usePalette();
  const last = rungs.length - 1;
  if (variant === 'steps') {
    return (
      <View style={styles.steps}>
        {rungs.map((r, i) => {
          const isLast = i === last;
          const g = color;
          return (
            <Appear key={r.rank} index={i} style={{ marginLeft: Math.min(i, 5) * 10 }}>
              <View
                accessible
                style={[
                  styles.step,
                  {
                    backgroundColor: isLast ? palette.surface : (g?.tint ?? palette.surfaceAlt),
                    borderColor: g?.color ?? palette.lineStrong,
                    borderWidth: isLast ? 2 : 1,
                  },
                ]}>
                <Txt variant="data" color={g?.ink ?? palette.inkSoft} style={styles.stepRank}>
                  {RANK_ES[r.rank] ?? r.rank}
                </Txt>
                <Txt variant={isLast ? 'bodyStrong' : 'body'} color={palette.ink} style={styles.stepName} numberOfLines={2}>
                  {r.es ? `${r.es} ` : ''}
                  <Txt variant="sci" color={palette.inkSoft}>
                    {r.es ? `(${r.sci})` : r.sci}
                  </Txt>
                </Txt>
              </View>
            </Appear>
          );
        })}
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      {rungs.map((r, i) => {
        const on = reached === undefined || i <= reached;
        return (
          <View key={r.rank} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.node,
                  {
                    backgroundColor: on ? (i === last ? palette.red : palette.ink) : 'transparent',
                    borderColor: on ? palette.ink : palette.lineStrong,
                  },
                ]}
              />
              {i < last && <View style={[styles.line, { backgroundColor: on ? palette.ink : palette.line }]} />}
            </View>
            <View style={styles.text}>
              <Txt variant="data" tone="faint">
                {RANK_ES[r.rank] ?? r.rank}
              </Txt>
              <Txt variant={i === last ? 'bodyStrong' : 'body'} tone={on ? 'ink' : 'faint'}>
                {r.es ? `${r.es} ` : ''}
                <Txt variant="sci" tone={on ? 'soft' : 'faint'}>
                  {r.es ? `(${r.sci})` : r.sci}
                </Txt>
              </Txt>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  steps: { gap: space.xs + 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44, paddingHorizontal: space.md, paddingVertical: space.xs + 2, borderRadius: radius.md },
  stepRank: { width: 64 },
  stepName: { flex: 1 },
  row: { flexDirection: 'row', minHeight: 48 },
  rail: { width: 22, alignItems: 'center' },
  node: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 5 },
  line: { width: 2, flex: 1, marginVertical: 2 },
  text: { flex: 1, paddingLeft: space.sm, paddingBottom: space.md },
});
