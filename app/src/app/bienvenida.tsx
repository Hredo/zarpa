import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountButtons } from '@/components/AccountButtons';
import { Icon, type IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Appear } from '@/components/motion';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { markWelcomeSeen } from '@/lib/welcome';
import { HIT, radius, space, usePalette } from '@/theme';

type Page = { icon: IconName; title: string; body: string; color: 'brand' | 'leaf' | 'sky' };

const PAGES: Page[] = [
  {
    icon: 'eye',
    title: 'Avista',
    body: 'Apunta con la cámara a cualquier animal y Zarpa lo reconoce en el momento, sin necesidad de conexión.',
    color: 'brand',
  },
  {
    icon: 'layers',
    title: 'Colecciona',
    body: 'Cada avistamiento se convierte en una pegatina de tu álbum, con el lugar y el día en que lo viste.',
    color: 'leaf',
  },
  {
    icon: 'globe',
    title: 'Explora',
    body: 'Descubre animales de todo el mundo: dónde viven, cómo son y cuáles te quedan por encontrar.',
    color: 'sky',
  },
];

/**
 * Bienvenida de la primera vez: tres páginas (avistar, coleccionar, explorar)
 * y una última con el inicio de sesión, que es opcional. Se abre una sola vez
 * (la marca la pone WelcomeGate) y siempre se puede saltar.
 */
export default function Bienvenida() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = PAGES.length;

  const close = () => {
    void markWelcomeSeen();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const goTo = (i: number) => {
    scroller.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));

  const tone = (c: Page['color']) => (c === 'brand' ? [palette.brandTint, palette.brandInk] : c === 'leaf' ? [palette.leafTint, palette.leaf] : [palette.skyTint, palette.sky]);

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.top}>
        <Logo variant="full" size={36} />
        {page < last ? (
          <Press onPress={close} accessibilityRole="button" accessibilityLabel="Saltar la bienvenida" style={styles.skip}>
            <Txt variant="bodyStrong" tone="soft">
              Saltar
            </Txt>
          </Press>
        ) : null}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
        style={styles.fill}
        contentContainerStyle={{ alignItems: 'stretch' }}>
        {PAGES.map((p) => {
          const [bg, fg] = tone(p.color);
          return (
            <View key={p.title} style={[styles.page, { width }]}>
              <Appear from="scale">
                <View style={[styles.badge, { backgroundColor: bg }]}>
                  <Icon name={p.icon} size={48} color={fg} />
                </View>
              </Appear>
              <Txt variant="hero" style={styles.title} accessibilityRole="header">
                {p.title}
              </Txt>
              <Txt variant="body" tone="soft" style={styles.body}>
                {p.body}
              </Txt>
            </View>
          );
        })}
        <View style={[styles.page, { width }]}>
          <View style={[styles.badge, { backgroundColor: palette.brandTint }]}>
            <Icon name="heart" size={48} color={palette.brandInk} />
          </View>
          <Txt variant="title" style={styles.title} accessibilityRole="header">
            Guarda tu álbum
          </Txt>
          <Txt variant="body" tone="soft" style={styles.body}>
            Con una cuenta tendrás tu perfil y una copia en la nube para no perder tus avistamientos si cambias de móvil. Es opcional: Zarpa funciona igual sin cuenta.
          </Txt>
          <View style={styles.accounts}>
            <AccountButtons onSignedIn={close} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.foot}>
        <View style={styles.dots} accessibilityLabel={`Página ${page + 1} de ${last + 1}`}>
          {[...PAGES, null].map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === page ? palette.strong : palette.lineStrong, width: i === page ? 24 : 8 }]} />
          ))}
        </View>
        {page < last ? (
          <Press
            haptic
            onPress={() => goTo(page + 1)}
            accessibilityRole="button"
            accessibilityLabel="Siguiente"
            style={[styles.cta, { backgroundColor: palette.brand }]}>
            <Txt variant="subheading" tone="onBrand">
              Siguiente
            </Txt>
          </Press>
        ) : (
          <Press onPress={close} accessibilityRole="button" accessibilityLabel="Ahora no" style={styles.later}>
            <Txt variant="bodyStrong" tone="soft">
              Ahora no
            </Txt>
          </Press>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl },
  skip: { minHeight: HIT, justifyContent: 'center', paddingHorizontal: space.sm },
  page: { paddingHorizontal: space.xl, justifyContent: 'center' },
  badge: { width: 104, height: 104, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: space.xl },
  body: { marginTop: space.md },
  accounts: { marginTop: space.xl },
  foot: { paddingHorizontal: space.xl, gap: space.lg },
  dots: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  cta: { height: HIT + 8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  later: { height: HIT + 8, alignItems: 'center', justifyContent: 'center' },
});
