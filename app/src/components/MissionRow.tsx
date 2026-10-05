import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import type { MissionState } from '@/lib/useMissions';
import { displayName } from '@/lib/speciesName';
import { duration, ease, groupColor, radius, space, usePalette } from '@/theme';

import { Icon } from './Icon';
import { metalOf } from './Medal';
import { Meter } from './Meter';
import { FadeImage } from './motion/FadeImage';
import { Press } from './Press';
import { Txt } from './Txt';

const STAMP = 52;

/**
 * Sello de recompensa: un troquel de bronce, plata u oro con el icono del reto.
 * Sin ganar es un hueco gris punteado; al ganarlo se estampa (entra desde 1,14
 * y gira un poco hasta su sitio, 420 ms, ease-out, sin rebote) solo si el reto
 * se cumple con la pantalla abierta.
 */
export function Stamp({ tier, icon, earned, animate, size = STAMP }: { tier: 1 | 2 | 3; icon: MissionState['icon']; earned: boolean; animate?: boolean; size?: number }) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const metal = metalOf(tier);
  const p = useSharedValue(animate && !reduced ? 0 : 1);
  useEffect(() => {
    if (animate && !reduced) p.set(withTiming(1, { duration: duration.emphasis, easing: ease.out }));
  }, [animate, reduced, p]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + 0.75 * p.get(),
    transform: [{ scale: 1.14 - 0.14 * p.get() }, { rotate: `${-14 * (1 - p.get())}deg` }],
  }));
  const r = size / 2;
  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 52 52">
        <Circle cx={26} cy={26} r={24} fill={earned ? metal.mid : 'none'} stroke={earned ? metal.dark : palette.lineStrong} strokeWidth={2} strokeDasharray={earned ? '0' : '3 4'} />
        <Circle cx={26} cy={26} r={19} fill={earned ? metal.light : palette.surfaceAlt} stroke={earned ? metal.ring : 'none'} strokeWidth={1.5} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Icon name={icon} size={r * 0.82} color={earned ? '#5B3B0A' : palette.inkFaint} strokeWidth={2} />
      </View>
    </Animated.View>
  );
}

type Props = {
  mission: MissionState;
  compact?: boolean;
};

/** Un reto: icono, título, medidor de avance y el sello que da. */
export function MissionRow({ mission, compact }: Props) {
  const palette = usePalette();
  const { progress, reward, icon } = mission;
  const wasDone = useRef(progress.done);
  const [justDone, setJustDone] = useState(false);
  useEffect(() => {
    if (progress.done && !wasDone.current) {
      setJustDone(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    wasDone.current = progress.done;
  }, [progress.done]);

  const unit = mission.unit === 'dias' ? 'días' : 'especies';
  const g = mission.match.grp ? groupColor(mission.match.grp) : null;
  const color = progress.done ? palette.leaf : (g?.color ?? palette.sky);
  const tint = progress.done ? palette.leafTint : (g?.tint ?? palette.skyTint);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${mission.title}. ${progress.done ? 'Cumplido' : `${progress.value} de ${progress.target} ${unit}`}. Recompensa: ${reward.stamp}`}>
      <View style={[styles.badge, { backgroundColor: tint }]}>
        <Icon name={progress.done ? 'check' : icon} size={22} color={progress.done ? palette.leaf : color} />
      </View>
      <View style={styles.flex}>
        <Txt variant="bodyStrong" numberOfLines={compact ? 2 : 3}>
          {mission.title}
        </Txt>
        {!compact ? (
          <Txt variant="small" tone="soft" style={styles.hint}>
            {mission.hint}
          </Txt>
        ) : null}
        <Meter
          value={progress.ratio}
          color={color}
          height={compact ? 6 : 8}
          valueLabel={progress.done ? 'Cumplido' : `${progress.value} de ${progress.target}`}
          style={styles.meter}
        />
        {!compact && mission.suggestions.length ? <Suggestions items={mission.suggestions} /> : null}
      </View>
      <Stamp tier={reward.tier} icon={icon} earned={progress.done} animate={justDone} size={compact ? 40 : STAMP} />
    </View>
  );
}

function Suggestions({ items }: { items: MissionState['suggestions'] }) {
  const palette = usePalette();
  return (
    <View style={styles.sug}>
      <Txt variant="label" tone="soft">
        Se ven en tu país
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sugRow}>
        {items.map((sp) => {
          const n = displayName(sp);
          const gc = groupColor(sp.grp);
          return (
            <Press
              key={sp.id}
              onPress={() => router.push({ pathname: '/especie/[id]', params: { id: String(sp.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`Ver ${n.name}`}
              style={[styles.chip, { backgroundColor: palette.surface, borderColor: palette.line }]}>
              {sp.img ? (
                <FadeImage source={sp.img} style={styles.thumb} contentFit="cover" placeholderColor={gc.tint} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: gc.tint }]} />
              )}
              <Txt variant="small" numberOfLines={1} style={n.isSci ? styles.sci : undefined}>
                {n.name}
              </Txt>
            </Press>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  badge: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: space.xxs },
  meter: { marginTop: space.sm },
  sug: { marginTop: space.md, gap: space.xs },
  sugRow: { gap: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, maxWidth: 190, paddingRight: space.md, paddingLeft: space.xs, borderRadius: radius.pill, borderWidth: 1 },
  thumb: { width: 36, height: 36, borderRadius: 18 },
  sci: { fontStyle: 'italic' },
});
