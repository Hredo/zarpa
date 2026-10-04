import { StyleSheet, View } from 'react-native';

import { space, usePalette } from '@/theme';

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
export function TaxonLadder({ rungs, reached }: { rungs: Rung[]; reached?: number }) {
  const palette = usePalette();
  const last = rungs.length - 1;
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
                    backgroundColor: on ? (i === last ? palette.trailRed : palette.ink) : 'transparent',
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
  row: { flexDirection: 'row', minHeight: 48 },
  rail: { width: 22, alignItems: 'center' },
  node: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 5 },
  line: { width: 2, flex: 1, marginVertical: 2 },
  text: { flex: 1, paddingLeft: space.sm, paddingBottom: space.md },
});
