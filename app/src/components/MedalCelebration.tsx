import { Canvas, Circle, Group, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { TIER_NAME, type Unlock } from '@/lib/achievements';
import { duration, ease, usePalette } from '@/theme';

import { Medal, metalOf } from './Medal';
import { Press } from './Press';
import { Txt } from './Txt';

const STAGE = 320;
const MEDAL = 156;
const RAYS = 12;

/** Doce rayos finos desde el centro: un abanico de luz detrás de la medalla. */
function raysPath() {
  const p = Skia.Path.Make();
  const c = STAGE / 2;
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2;
    const half = 0.07;
    p.moveTo(c, c);
    p.lineTo(c + Math.cos(a - half) * c, c + Math.sin(a - half) * c);
    p.lineTo(c + Math.cos(a + half) * c, c + Math.sin(a + half) * c);
    p.close();
  }
  return p;
}

type Props = {
  unlock: Unlock;
  /** Cuántas quedan por celebrar después de esta. */
  remaining: number;
  onClose: () => void;
};

/**
 * Revelación de una medalla nueva: el telón se funde, la medalla entra desde
 * 0,86 con ease-out (sin rebote), un resplandor de Skia se abre detrás y
 * giran despacio unos rayos. Una vibración de éxito en el instante en que
 * aparece. Con «reducir movimiento» solo hay fundido y nada gira.
 */
export function MedalCelebration({ unlock, remaining, onClose }: Props) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const metal = metalOf(unlock.tier);
  const rays = useMemo(() => raysPath(), []);

  const veil = useSharedValue(0);
  const medal = useSharedValue(0);
  const glow = useSharedValue(0);
  const text = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    veil.set(withTiming(1, { duration: duration.small, easing: ease.out }));
    medal.set(withDelay(reduced ? 0 : 120, withTiming(1, { duration: reduced ? duration.small : duration.emphasis, easing: ease.out })));
    glow.set(withDelay(reduced ? 0 : 200, withTiming(1, { duration: reduced ? duration.small : duration.reveal, easing: ease.out })));
    text.set(withDelay(reduced ? 0 : 420, withTiming(1, { duration: duration.enter, easing: ease.out })));
    if (!reduced) spin.set(withRepeat(withTiming(1, { duration: 24_000, easing: Easing.linear }), -1, false));
    // La celebración se monta una vez por medalla (la pantalla le pone `key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.get() }));
  const medalStyle = useAnimatedStyle(() => ({
    opacity: medal.get(),
    transform: [{ scale: reduced ? 1 : 0.86 + 0.14 * medal.get() }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.get(),
    transform: [{ translateY: reduced ? 0 : (1 - text.get()) * 10 }],
  }));
  const glowOpacity = useDerivedValue(() => glow.get());
  const raysOpacity = useDerivedValue(() => glow.get() * 0.22);
  const rotation = useDerivedValue(() => [{ rotate: spin.get() * Math.PI * 2 }]);

  const def = unlock.state.def;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, veilStyle]} accessibilityViewIsModal>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.strongDeep, opacity: 0.94 }]} />
      <View style={styles.center}>
        <View style={styles.stage} pointerEvents="none">
          <Canvas style={StyleSheet.absoluteFill}>
            <Group opacity={raysOpacity} origin={vec(STAGE / 2, STAGE / 2)} transform={rotation}>
              <Path path={rays} color={metal.light} />
            </Group>
            <Circle c={vec(STAGE / 2, STAGE / 2)} r={STAGE / 2} opacity={glowOpacity}>
              <RadialGradient c={vec(STAGE / 2, STAGE / 2)} r={STAGE / 2} colors={[`${metal.mid}CC`, `${metal.mid}33`, `${metal.mid}00`]} positions={[0, 0.55, 1]} />
            </Circle>
          </Canvas>
          <Animated.View style={medalStyle}>
            <Medal def={def} tier={unlock.tier} size={MEDAL} />
          </Animated.View>
        </View>

        <Animated.View style={[styles.copy, textStyle]}>
          <Txt variant="label" color={metal.light} upper>
            Medalla de {TIER_NAME[unlock.tier].toLowerCase()}
          </Txt>
          <Txt variant="title" tone="onStrong" align="center" accessibilityRole="header">
            {def.title}
          </Txt>
          <Txt variant="body" tone="onStrongSoft" align="center">
            {def.goal(def.thresholds[unlock.tier - 1])}
          </Txt>
          <Press onPress={onClose} accessibilityRole="button" accessibilityLabel={remaining > 0 ? 'Siguiente medalla' : 'Cerrar'} style={[styles.btn, { backgroundColor: palette.brand }]}>
            <Txt variant="bodyStrong" tone="onBrand">
              {remaining > 0 ? `Siguiente · quedan ${remaining}` : 'Genial'}
            </Txt>
          </Press>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  stage: { width: STAGE, height: STAGE, alignItems: 'center', justifyContent: 'center' },
  copy: { alignItems: 'center', gap: 8, marginTop: 8, maxWidth: 340 },
  btn: { marginTop: 20, minHeight: 48, minWidth: 180, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
