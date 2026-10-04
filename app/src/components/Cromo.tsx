import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SpeciesRow } from '@/db/catalog';
import { radius, space, usePalette } from '@/theme';

import { Icon } from './Icon';
import { IucnBadge } from './IucnBadge';
import { Press } from './Press';
import { TrailMark } from './TrailMark';
import { Txt } from './Txt';
import { expandUrl } from '@/lib/urls';

export const CROMO_RATIO = 0.7;
const BODY_H = 92;

type Props = {
  species: SpeciesRow;
  caught: boolean;
  width: number;
  onPress: (id: number) => void;
};

/** Miniatura de 330 px de Commons para listas (ancho estándar de Wikimedia). */
export function listThumb(url: string | null): string | null {
  return expandUrl(url)?.replace(/\/960px-/, '/330px-') ?? null;
}

/*
 * Cromo del Bestiario.
 *
 * Sin avistar, la foto sale en duotono verde musgo (como el hueco de un álbum
 * de cromos aún por llenar): se ve qué animal es, pero se nota que falta. Al
 * ficharlo recupera el color y aparece la marca de «en tu cuaderno». El duotono
 * se hace con dos capas de mezcla sobre la foto (`saturation` y `color`), que
 * iOS y Android aplican en la GPU; un filtro por píxel en JS sería inviable en
 * una lista de 97 000 especies.
 */
function CromoBase({ species, caught, width, onPress }: Props) {
  const palette = usePalette();
  const imgH = Math.round(width / CROMO_RATIO) - BODY_H;
  const name = species.name_es ?? species.name_en ?? species.sci;
  const showSci = name !== species.sci;
  const threatened = species.iucn && ['VU', 'EN', 'CR', 'EW'].includes(species.iucn);

  return (
    <Press
      onPress={() => onPress(species.id)}
      accessibilityRole="button"
      accessibilityLabel={`${name}${caught ? ', avistada' : ''}`}
      style={[styles.card, { width, backgroundColor: palette.surface, borderColor: palette.line }]}>
      <View style={[styles.photo, { height: imgH, backgroundColor: palette.forest }]}>
        {species.img ? (
          <>
            <Image
              source={listThumb(species.img)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              recyclingKey={String(species.id)}
              transition={160}
              cachePolicy="memory-disk"
            />
            {!caught && (
              <>
                <View style={[StyleSheet.absoluteFill, styles.desat]} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.forest, mixBlendMode: 'color' }]} />
              </>
            )}
          </>
        ) : (
          <View style={styles.noPhoto}>
            <Icon name={species.grp} size={44} color={palette.onForestSoft} strokeWidth={1.4} />
          </View>
        )}
        <View style={[styles.number, { backgroundColor: palette.surface }]}>
          <Txt variant="data" tone="ink">
            {String(species.seq).padStart(4, '0')}
          </Txt>
        </View>
        {caught && (
          <View style={[styles.caught, { backgroundColor: palette.blaze, borderColor: palette.ink }]}>
            <Icon name="check" size={16} color={palette.onBlaze} strokeWidth={2.6} />
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Txt variant="subheading" numberOfLines={2} style={styles.name}>
          {name}
        </Txt>
        {showSci && (
          <Txt variant="sci" tone="soft" numberOfLines={1} style={styles.sci}>
            {species.sci}
          </Txt>
        )}
        <View style={styles.meta}>
          <TrailMark tier={species.rarity} />
          {threatened ? <IucnBadge code={species.iucn!} compact /> : null}
        </View>
      </View>
    </Press>
  );
}

export const Cromo = memo(CromoBase);

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  photo: { width: '100%', overflow: 'hidden' },
  desat: { backgroundColor: '#808080', mixBlendMode: 'saturation' },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  number: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  caught: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: space.sm + 2, paddingTop: space.sm, height: BODY_H },
  name: { fontSize: 18, lineHeight: 19 },
  sci: { fontSize: 13, lineHeight: 16, marginTop: 1 },
  meta: { position: 'absolute', left: space.sm + 2, bottom: space.sm + 2, flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
