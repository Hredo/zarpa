import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SpeciesRow } from '@/db/catalog';
import { displayName } from '@/lib/speciesName';
import { expandUrl } from '@/lib/urls';
import { elevation, groupColor, radius, space, usePalette } from '@/theme';

import { GroupPill } from './GroupPill';
import { Icon } from './Icon';
import { IucnBadge } from './IucnBadge';
import { FadeImage } from './motion/FadeImage';
import { Press } from './Press';
import { TrailMark } from './TrailMark';
import { Txt } from './Txt';

export const CROMO_RATIO = 0.7;
const BODY_H = 96;
const INSET = 6;

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
 * Cromo del Bestiario: una pegatina blanca con la foto troquelada dentro.
 *
 * Sin avistar, la foto sale en duotono del color de su grupo (azul las aves,
 * esmeralda los anfibios…): se reconoce el animal, se nota que falta, y el
 * álbum entero se ve de colores en vez de gris. Al ficharlo recupera su color
 * real y aparece la marca mandarina de «en tu cuaderno». El duotono son dos
 * capas de mezcla sobre la foto (`saturation` y `color`), que iOS y Android
 * aplican en la GPU; un filtro por píxel en JS sería inviable en una lista de
 * cientos de miles de especies.
 *
 * API: `<Cromo species={row} caught={bool} width={w} onPress={(id) => …} />`;
 * alto = `width / CROMO_RATIO`.
 */
function CromoBase({ species, caught, width, onPress }: Props) {
  const palette = usePalette();
  const g = groupColor(species.grp);
  const imgH = Math.round(width / CROMO_RATIO) - BODY_H - INSET;
  const dn = displayName(species);
  const name = dn.name;
  const threatened = species.iucn && ['VU', 'EN', 'CR', 'EW'].includes(species.iucn);

  return (
    <Press
      onPress={() => onPress(species.id)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${dn.isSci ? dn.group : dn.sub}${caught ? ', avistada' : ''}`}
      style={[styles.card, elevation.card, { width, backgroundColor: palette.surface }]}>
      <View style={[styles.photo, { height: imgH, backgroundColor: g.tint }]}>
        {species.img ? (
          <>
            <FadeImage
              source={listThumb(species.img)}
              style={StyleSheet.absoluteFill}
              placeholderColor={g.tint}
              contentFit="cover"
              recyclingKey={String(species.id)}
              cachePolicy="memory-disk"
            />
            {!caught && (
              <>
                <View style={[StyleSheet.absoluteFill, styles.desat]} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: g.color, mixBlendMode: 'color' }]} />
              </>
            )}
          </>
        ) : (
          <View style={styles.noPhoto}>
            <View style={[styles.watermark, { opacity: caught ? 0.5 : 0.3 }]}>
              <Icon name={species.grp} size={Math.round(width * 0.95)} color={g.color} strokeWidth={1.1} />
            </View>
            <View style={[styles.disc, { backgroundColor: palette.surface }, elevation.card]}>
              <Icon name={species.grp} size={Math.round(Math.min(56, width * 0.32))} color={g.color} strokeWidth={1.7} />
            </View>
            <Txt variant="label" color={g.ink} numberOfLines={1} style={styles.noPhotoLabel}>
              Sin foto aún
            </Txt>
          </View>
        )}
        <View style={[styles.number, { backgroundColor: palette.surface }]}>
          <Txt variant="data" tone="ink">
            {String(species.seq).padStart(4, '0')}
          </Txt>
        </View>
        {caught && (
          <View style={[styles.caught, { backgroundColor: palette.brand, borderColor: palette.surface }]}>
            <Icon name="check" size={16} color={palette.onBrand} strokeWidth={2.8} />
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Txt variant="subheading" numberOfLines={2} style={[styles.name, dn.isSci ? styles.italic : null]}>
          {name}
        </Txt>
        <Txt
          variant={dn.isSci ? 'small' : 'sci'}
          tone="soft"
          numberOfLines={1}
          style={dn.isSci ? styles.sciSub : styles.sci}>
          {dn.sub}
        </Txt>
        <View style={styles.meta}>
          <GroupPill code={species.grp} iconOnly />
          <TrailMark tier={species.rarity} />
          {threatened ? <IucnBadge code={species.iucn!} compact /> : null}
        </View>
      </View>
    </Press>
  );
}

export const Cromo = memo(CromoBase);

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: INSET, paddingBottom: 0 },
  photo: { width: '100%', overflow: 'hidden', borderRadius: radius.md },
  desat: { backgroundColor: '#808080', mixBlendMode: 'saturation' },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, overflow: 'hidden' },
  watermark: { position: 'absolute', right: '-18%', bottom: '-14%', transform: [{ rotate: '-10deg' }] },
  disc: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  noPhotoLabel: { opacity: 0.9 },
  italic: { fontStyle: 'italic' },
  sciSub: { fontSize: 13, lineHeight: 16, marginTop: 1 },
  number: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  caught: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: space.xs, paddingTop: space.sm, height: BODY_H },
  name: { fontSize: 16, lineHeight: 19 },
  sci: { fontSize: 13, lineHeight: 16, marginTop: 1 },
  meta: { position: 'absolute', left: space.xs, bottom: space.sm + 2, flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
