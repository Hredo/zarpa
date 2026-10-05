import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { SpeciesImage } from '@/db/catalog';
import type { GroupCode } from '@/lib/groups';
import { expandUrl } from '@/lib/urls';
import { elevation, groupColor, space, usePalette } from '@/theme';

import { Icon } from '../Icon';
import { FadeImage } from '../motion/FadeImage';
import { Press } from '../Press';
import { Txt } from '../Txt';

/** Altura del fundido y cuánto sube el contenido que viene debajo. */
export const HERO_FADE = 150;
export const HERO_OVERLAP = 44;

type Props = {
  images: SpeciesImage[];
  name: string;
  grp: GroupCode;
  width: number;
  height: number;
  top: number;
  saved: boolean;
  onBack: () => void;
  onToggleSaved: () => void;
  /** Imagen visible (para la atribución, que vive fuera, bajo el nombre). */
  page: number;
  onPage: (i: number) => void;
};

function RoundBtn({ icon, label, onPress, active }: { icon: 'back' | 'bookmark' | 'bookmarkFilled'; label: string; onPress: () => void; active?: boolean }) {
  const palette = usePalette();
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      haptic={icon !== 'back'}
      style={[styles.round, { backgroundColor: active ? palette.brand : 'rgba(255,255,255,0.92)' }, elevation.card]}>
      <Icon name={icon} size={22} color={active ? palette.onBrand : palette.ink} />
    </Press>
  );
}

/**
 * Cabecera tipo póster: foto grande a sangre que se funde con el fondo, botones
 * redondos claros encima y puntos de paginación. La foto no lleva texto encima:
 * el nombre entra por debajo, sobre el fundido.
 */
export function FichaHero({ images, name, grp, width, height, top, saved, onBack, onToggleSaved, page, onPage }: Props) {
  const palette = usePalette();
  const g = groupColor(grp);
  return (
    <View style={{ height, backgroundColor: g.tint }}>
      {images.length > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => onPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {images.map((im) => (
            <FadeImage
              key={im.rank}
              source={expandUrl(im.url)}
              style={{ width, height }}
              contentFit="cover"
              placeholderColor={g.tint}
              accessibilityLabel={`Fotografía de ${name}`}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <Icon name={grp} size={112} color={g.color} strokeWidth={1.2} />
        </View>
      )}
      <Svg width={width} height={HERO_FADE} style={styles.fade} pointerEvents="none">
        <Defs>
          <LinearGradient id="fadeBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.bg} stopOpacity={0} />
            <Stop offset="0.6" stopColor={palette.bg} stopOpacity={0.88} />
            <Stop offset="1" stopColor={palette.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={HERO_FADE} fill="url(#fadeBg)" />
      </Svg>
      <View style={[styles.topBar, { top }]}>
        <RoundBtn icon="back" label="Volver" onPress={onBack} />
        {images.length > 1 && (
          <View style={styles.dots} pointerEvents="none">
            {images.map((im, i) => (
              <View key={im.rank} style={[styles.dot, { backgroundColor: i === page ? palette.surface : 'rgba(255,255,255,0.55)', width: i === page ? 18 : 7 }]} />
            ))}
          </View>
        )}
        <RoundBtn
          icon={saved ? 'bookmarkFilled' : 'bookmark'}
          label={saved ? 'Quitar del Atlas' : 'Guardar en el Atlas'}
          onPress={onToggleSaved}
          active={saved}
        />
      </View>
    </View>
  );
}

/** Atribución de la foto visible: siempre debajo de la imagen, nunca encima. */
export function PhotoCredit({ image, onOpen }: { image: SpeciesImage | undefined; onOpen: (url: string) => void }) {
  const palette = usePalette();
  if (!image) {
    return (
      <Txt variant="small" tone="faint">
        Aún no hay una foto con licencia libre de esta especie.
      </Txt>
    );
  }
  const page = image.page ? expandUrl(image.page) : null;
  return (
    <Press disabled={!page} onPress={() => page && onOpen(page)} style={styles.credit} accessibilityLabel="Abrir la página de la foto">
      <Icon name="camera" size={14} color={palette.inkFaint} />
      <Txt variant="small" tone="faint" numberOfLines={2} style={styles.creditText}>
        {image.author ?? 'Autor sin indicar'} · {image.license ?? 'licencia libre'} · {image.source === 'commons' ? 'Wikimedia Commons' : 'iNaturalist'}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: HERO_FADE / 2 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 5, paddingHorizontal: 10, height: 22, alignItems: 'center', borderRadius: 11, backgroundColor: 'rgba(12,21,41,0.35)' },
  dot: { height: 7, borderRadius: 4 },
  credit: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  creditText: { flexShrink: 1 },
});
