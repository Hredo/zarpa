import { router } from 'expo-router';
import { Fragment } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { MissionRow } from '@/components/MissionRow';
import { Appear } from '@/components/motion';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { isoWeek } from '@/lib/gameUtil';
import { SEASON_LABEL } from '@/lib/missions';
import { useMissions } from '@/lib/useMissions';
import { space, usePalette } from '@/theme';

const dm = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });

/*
 * Misiones: los tres retos de la semana (fácil, medio y difícil) y los dos de
 * la temporada según el mes y el hemisferio. El avance sale del cuaderno; el
 * sello de cada reto se estampa al cumplirlo.
 */
export default function Misiones() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { weekly, seasonal, season, hemisphereKnown, hasCountry, completed, total, loading } = useMissions();
  const week = isoWeek();
  const lastDay = new Date(week.end.getFullYear(), week.end.getMonth(), week.end.getDate() - 1);

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.lg }}>
        <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
          <Icon name="back" />
        </Press>
        <Appear>
          <Txt variant="title" accessibilityRole="header" style={{ marginTop: space.lg }}>
            Misiones
          </Txt>
          <View style={styles.summary}>
            <AnimatedNumber value={completed} variant="hero" />
            <Txt variant="body" tone="soft" style={styles.flex}>
              {loading ? 'Revisando tu cuaderno…' : `de ${total} retos cumplidos`}
            </Txt>
          </View>
        </Appear>

        <Section
          title="Esta semana"
          icon="calendar"
          accent={palette.brandInk}
          tint={palette.brandTint}
          aside={
            <Txt variant="small" tone="soft">
              {dm.format(week.start)} – {dm.format(lastDay)}
            </Txt>
          }>
          <Card>
            {weekly.map((m, i) => (
              <Fragment key={m.id}>
                {i > 0 ? <View style={[styles.rule, { backgroundColor: palette.line }]} /> : null}
                <MissionRow mission={m} />
              </Fragment>
            ))}
          </Card>
          <Txt variant="small" tone="faint" style={styles.note}>
            Los retos cambian cada lunes. Cuentan especies distintas avistadas dentro de la semana.
          </Txt>
        </Section>

        <Section title={`Reto de ${SEASON_LABEL[season]}`} icon={season === 'invierno' ? 'moon' : 'sun'} accent={palette.sky} tint={palette.skyTint}>
          <Card>
            {seasonal.map((m, i) => (
              <Fragment key={m.id}>
                {i > 0 ? <View style={[styles.rule, { backgroundColor: palette.line }]} /> : null}
                <MissionRow mission={m} />
              </Fragment>
            ))}
          </Card>
          <Txt variant="small" tone="faint" style={styles.note}>
            {hemisphereKnown
              ? 'La estación sale de tu última ubicación y se renueva cada mes.'
              : 'Sin ubicación se supone el hemisferio norte. Activa la ubicación al avistar para ajustar la estación.'}
            {hasCountry ? '' : ' Con tu país conocido verás especies concretas que se ven allí.'}
          </Txt>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.md },
  rule: { height: 1, marginVertical: space.lg },
  note: { marginTop: space.md },
});
