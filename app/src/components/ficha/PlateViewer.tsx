import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CommonsMedia } from '@/lib/commons';
import { duration, ease, radius, space, usePalette } from '@/theme';

import { Icon } from '../Icon';
import { FadeImage } from '../motion/FadeImage';
import { Press } from '../Press';
import { Txt } from '../Txt';

const MAX_SCALE = 6;

/**
 * Lámina o huella a pantalla completa, para ver los detalles: pellizcar para
 * acercar (hasta 6×), arrastrar para moverse y doble toque para acercar o
 * volver. Debajo, el pie de figura, la obra de la que sale, autor y licencia
 * con enlace al original (Commons o Zenodo).
 *
 * API: `<PlateViewer items={lista} index={i} onIndex={setI} onClose={…} />`
 * (`index` null = cerrado).
 */
export function PlateViewer({
  items,
  index,
  onIndex,
  onClose,
  title,
}: {
  items: readonly CommonsMedia[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  title?: string;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const item = index != null ? items[index] : null;

  return (
    <Modal visible={item != null} animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent>
      <GestureHandlerRootView style={[styles.fill, { backgroundColor: palette.strongDeep }]}>
        {item ? (
          <>
            <ZoomImage key={item.title} item={item} />
            <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
              <Press onPress={onClose} accessibilityLabel="Cerrar" style={[styles.round, { backgroundColor: palette.scrim }]}>
                <Icon name="close" color={palette.onStrong} />
              </Press>
              <View style={[styles.counter, { backgroundColor: palette.scrim }]}>
                <Txt variant="label" tone="onStrong" numberOfLines={1}>
                  {title ? `${title} · ` : ''}
                  {(index ?? 0) + 1} de {items.length}
                </Txt>
              </View>
            </View>
            <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]} pointerEvents="box-none">
              <View style={styles.nav}>
                <Press
                  disabled={(index ?? 0) <= 0}
                  onPress={() => onIndex((index ?? 0) - 1)}
                  accessibilityLabel="Anterior"
                  style={[styles.round, { backgroundColor: palette.scrim, opacity: (index ?? 0) <= 0 ? 0.35 : 1 }]}>
                  <Icon name="back" color={palette.onStrong} />
                </Press>
                <Txt variant="small" tone="onStrongSoft" align="center" style={styles.flex}>
                  Pellizca o toca dos veces para ver los detalles
                </Txt>
                <Press
                  disabled={(index ?? 0) >= items.length - 1}
                  onPress={() => onIndex((index ?? 0) + 1)}
                  accessibilityLabel="Siguiente"
                  style={[styles.round, { backgroundColor: palette.scrim, opacity: (index ?? 0) >= items.length - 1 ? 0.35 : 1 }]}>
                  <Icon name="chevronRight" color={palette.onStrong} />
                </Press>
              </View>
              {item.caption || item.source ? (
                <View style={[styles.info, { backgroundColor: palette.scrim }]}>
                  {item.caption ? (
                    <Txt variant="small" tone="onStrong" numberOfLines={5}>
                      {item.caption}
                    </Txt>
                  ) : null}
                  {item.source ? (
                    <Txt variant="small" tone="onStrongSoft" numberOfLines={2}>
                      {item.kind === 'articulo' ? 'Artículo: ' : 'Libro: '}
                      {item.source}
                      {item.year ? ` (${item.year})` : ''}
                    </Txt>
                  ) : null}
                </View>
              ) : null}
              <Press
                onPress={() => WebBrowser.openBrowserAsync(item.page)}
                accessibilityRole="link"
                accessibilityLabel={`Abrir el original en ${host(item)}`}
                style={[styles.credit, { backgroundColor: palette.scrim }]}>
                <Icon name="external" size={16} color={palette.onStrong} />
                <Txt variant="small" tone="onStrong" style={styles.flex} numberOfLines={2}>
                  {item.author ? `${item.author} · ` : ''}
                  {item.license} · {host(item)}
                </Txt>
              </Press>
            </View>
          </>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function host(item: CommonsMedia): string {
  return item.page.includes('zenodo.org') ? 'Zenodo' : 'Wikimedia Commons';
}

/** Imagen con zoom y desplazamiento en el hilo de la interfaz. */
function ZoomImage({ item }: { item: CommonsMedia }) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // El visor monta un ZoomImage nuevo por imagen (`key`): zoom y carga empiezan de cero.
  const [loaded, setLoaded] = useState(false);

  const clampTo = (v: number, s: number, side: number) => {
    'worklet';
    const lim = ((s - 1) * side) / 2;
    return Math.min(lim, Math.max(-lim, v));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.set(Math.min(MAX_SCALE, Math.max(1, savedScale.get() * e.scale)));
    })
    .onEnd(() => {
      savedScale.set(scale.get());
      tx.set(withTiming(clampTo(tx.get(), scale.get(), width), { duration: duration.small, easing: ease.out }));
      ty.set(withTiming(clampTo(ty.get(), scale.get(), height), { duration: duration.small, easing: ease.out }));
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      startX.set(tx.get());
      startY.set(ty.get());
    })
    .onUpdate((e) => {
      if (scale.get() <= 1) return;
      tx.set(clampTo(startX.get() + e.translationX, scale.get(), width));
      ty.set(clampTo(startY.get() + e.translationY, scale.get(), height));
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      const t = { duration: duration.enter, easing: ease.out };
      if (scale.get() > 1) {
        scale.set(withTiming(1, t));
        savedScale.set(1);
        tx.set(withTiming(0, t));
        ty.set(withTiming(0, t));
      } else {
        const s = 2.5;
        scale.set(withTiming(s, t));
        savedScale.set(s);
        // Acerca hacia donde se tocó.
        tx.set(withTiming(clampTo((width / 2 - e.x) * (s - 1), s, width), t));
        ty.set(withTiming(clampTo((height / 2 - e.y) * (s - 1), s, height), t));
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan))}>
      <Animated.View style={[styles.fill, styles.paperWrap, style]} accessible accessibilityLabel={item.caption ?? item.source ?? item.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')}>
        <View style={[styles.paper, !loaded && styles.paperLoading]}>
          <FadeImage
            source={item.url}
            style={{ width, height: height * 0.72 }}
            contentFit="contain"
            placeholderColor="transparent"
            onLoad={() => setLoaded(true)}
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  paperWrap: { alignItems: 'center', justifyContent: 'center' },
  // Las láminas antiguas tienen fondo de papel: sobre blanco se leen mejor que sobre el azul del visor.
  paper: { backgroundColor: '#FFFFFF' },
  paperLoading: { opacity: 0.6 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  counter: { flexShrink: 1, minHeight: 32, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: space.sm, paddingHorizontal: space.lg },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  info: { gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md },
  credit: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md },
});
