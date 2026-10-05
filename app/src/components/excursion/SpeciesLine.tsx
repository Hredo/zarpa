import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { listThumb } from '@/components/Cromo';
import { Icon } from '@/components/Icon';
import { Meter } from '@/components/Meter';
import { FadeImage } from '@/components/motion/FadeImage';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { probabilityLevel } from '@/lib/excursionLogic';
import { displayName } from '@/lib/speciesName';
import { groupColor, radius, space, usePalette } from '@/theme';

type Props = {
  species: { id: number; sci: string; name_es: string | null; grp: string; img: string | null };
  /** Probabilidad relativa 0–1 (barra y rótulo). */
  p: number;
  /** Casilla: marcada o no. */
  checked: boolean;
  /** Significado de la casilla, para el lector de pantalla. */
  checkLabel: string;
  onToggle: (id: number) => void;
  onOpen?: (id: number) => void;
  caught?: boolean;
};

/** Fila de especie del modo excursión: foto, nombre, barra de probabilidad y casilla. */
function SpeciesLineBase({ species, p, checked, checkLabel, onToggle, onOpen, caught }: Props) {
  const palette = usePalette();
  const g = groupColor(species.grp);
  const dn = displayName(species);
  const level = probabilityLevel(p);
  return (
    <View style={styles.row}>
      <Press onPress={() => onOpen?.(species.id)} disabled={!onOpen} accessibilityRole="button" accessibilityLabel={`Ficha de ${dn.name}`} style={styles.main}>
        <FadeImage source={listThumb(species.img)} placeholderColor={g.tint} contentFit="cover" style={styles.thumb} />
        <View style={styles.flex}>
          <Txt variant="bodyStrong" numberOfLines={1} style={dn.isSci ? { fontStyle: 'italic' } : undefined}>
            {dn.name}
          </Txt>
          <Meter value={p} color={g.color} height={6} style={styles.meter} />
          <Txt variant="small" tone="soft" numberOfLines={1}>
            {level.label}
            {caught ? ' · ya en tu cuaderno' : ''}
          </Txt>
        </View>
      </Press>
      <Press
        onPress={() => onToggle(species.id)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={`${checkLabel}: ${dn.name}`}
        style={styles.checkHit}>
        <View style={[styles.check, checked ? { backgroundColor: palette.leaf, borderColor: palette.leaf } : { borderColor: palette.lineStrong }]}>
          {checked ? <Icon name="check" size={18} color={palette.surface} strokeWidth={2.6} /> : null}
        </View>
      </Press>
    </View>
  );
}

export const SpeciesLine = memo(SpeciesLineBase);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 64 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: 52, height: 52, borderRadius: radius.md },
  meter: { marginVertical: space.xs },
  checkHit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  check: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
