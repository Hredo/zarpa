import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { Icon, type IconName } from '@/components/Icon';
import { Medal, accentColors } from '@/components/Medal';
import { MedalCelebration } from '@/components/MedalCelebration';
import { Meter } from '@/components/Meter';
import { Appear } from '@/components/motion';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { TIER_NAME, type MedalFamily, type MedalState } from '@/lib/achievements';
import { fmtInt } from '@/lib/format';
import { useAchievements } from '@/lib/useAchievements';
import { space, usePalette } from '@/theme';

const SECTIONS: { title: string; icon: IconName; families: MedalFamily[] }[] = [
  { title: 'Tu cuaderno', icon: 'cuaderno', families: ['total'] },
  { title: 'Por grupos', icon: 'bestiario', families: ['group'] },
  { title: 'Rarezas', icon: 'star', families: ['rarity'] },
  { title: 'Por el mundo', icon: 'globe', families: ['region', 'country'] },
  { title: 'Especies amenazadas', icon: 'leaf', families: ['threatened'] },
  { title: 'Constancia', icon: 'calendar', families: ['streak'] },
];

/*
 * Logros: todas las medallas con su progreso. Las ganadas brillan en su metal;
 * las bloqueadas, en gris con un medidor hacia el primer nivel. Las medallas
 * nuevas se celebran al entrar (una a una).
 */
export default function Logros() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { states, unlocked, total, pending, acknowledge, loading } = useAchievements();

  const sections = useMemo(
    () => SECTIONS.map((sec) => ({ ...sec, medals: states.filter((s) => sec.families.includes(s.def.family)) })).filter((sec) => sec.medals.length),
    [states],
  );

  const current = pending[0];

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.lg }}>
        <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
          <Icon name="back" />
        </Press>
        <Appear>
          <Txt variant="title" accessibilityRole="header" style={{ marginTop: space.lg }}>
            Logros
          </Txt>
          <View style={styles.summary}>
            <AnimatedNumber value={unlocked} variant="hero" />
            <Txt variant="body" tone="soft" style={styles.summaryText}>
              {loading ? 'Contando medallas…' : `de ${fmtInt(total)} medallas ganadas`}
            </Txt>
          </View>
          <Meter value={total ? unlocked / total : 0} color={palette.brand} height={12} />
        </Appear>

        {sections.map((sec) => (
          <Section key={sec.title} title={sec.title} icon={sec.icon} accent={palette.brandInk} tint={palette.brandTint}>
            <View style={styles.grid}>
              {sec.medals.map((s) => (
                <View key={s.def.id} style={styles.cell}>
                  <MedalTile state={s} />
                </View>
              ))}
            </View>
          </Section>
        ))}
      </ScrollView>

      {current ? (
        <MedalCelebration key={`${current.id}:${current.tier}`} unlock={current} remaining={pending.length - 1} onClose={() => acknowledge([current])} />
      ) : null}
    </View>
  );
}

function MedalTile({ state }: { state: MedalState }) {
  const palette = usePalette();
  const { def, tier, next, value, progress, goal } = state;
  const accent = accentColors(def.accent, palette);
  const locked = tier === 0;
  return (
    <Card
      padding="md"
      style={styles.tile}
      accessibilityLabel={`${def.title}. ${locked ? 'Bloqueada' : `Medalla de ${TIER_NAME[tier].toLowerCase()}`}. ${goal}`}>
      <View style={styles.medal}>
        <Medal def={def} tier={tier} size={84} />
      </View>
      <Txt variant="subheading" align="center" color={locked ? palette.inkFaint : palette.ink} numberOfLines={1}>
        {def.title}
      </Txt>
      <Txt variant="label" align="center" color={locked ? palette.inkFaint : palette.inkSoft}>
        {locked ? 'Sin ganar' : TIER_NAME[tier]}
      </Txt>
      <Txt variant="small" tone="soft" align="center" numberOfLines={3} style={styles.goal}>
        {goal}
      </Txt>
      <Meter
        value={progress}
        color={locked ? palette.inkFaint : tier === 3 ? palette.leaf : accent.color}
        height={8}
        valueLabel={next == null ? 'Completa' : `${fmtInt(value)} de ${fmtInt(next)}`}
        style={styles.meter}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.md, marginBottom: space.md },
  summaryText: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { width: '47.5%', flexGrow: 1 },
  tile: { alignItems: 'center', gap: space.xs },
  medal: { marginBottom: space.xs },
  goal: { minHeight: 54 },
  meter: { alignSelf: 'stretch', marginTop: space.sm },
});
