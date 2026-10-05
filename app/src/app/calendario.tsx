import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonthStrip } from '@/components/calendario/MonthStrip';
import { Card } from '@/components/Card';
import { listThumb } from '@/components/Cromo';
import { Icon, type IconName } from '@/components/Icon';
import { Appear } from '@/components/motion/Appear';
import { FadeImage } from '@/components/motion/FadeImage';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { monthReport, monthlyActivity, REGION_KM, type CalendarEntry, type MonthReport } from '@/lib/calendarData';
import { normalizeMonths } from '@/lib/calendarLogic';
import { fmtInt } from '@/lib/format';
import { useLastLocation } from '@/lib/location';
import { monthName } from '@/lib/months';
import { displayName } from '@/lib/speciesName';
import { groupColor, radius, space, usePalette } from '@/theme';

const GUTTER = space.lg;

/*
 * Calendario de la naturaleza: qué pasa este mes en tu región (150 km a tu
 * alrededor, o todo el mundo si no hay ubicación). Solo datos de iNaturalist
 * (observaciones confirmadas) y del catálogo; ver lib/calendarLogic.ts para los
 * criterios exactos de «en pico», «aparecen» y «se despiden».
 */
export default function Calendario() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const near = useLastLocation();
  const today = new Date().getMonth() + 1;
  const [month, setMonth] = useState(today);
  const [activity, setActivity] = useState<number[] | null>(null);
  const [report, setReport] = useState<{ month: number; data: MonthReport | null } | null>(null);
  const nearKey = near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : 'world';

  useEffect(() => {
    let alive = true;
    monthlyActivity(near).then((a) => alive && setActivity(a));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearKey]);

  useEffect(() => {
    let alive = true;
    monthReport(near, month).then((data) => alive && setReport({ month, data }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearKey, month]);

  const norm = useMemo(() => (activity ? normalizeMonths(activity) : null), [activity]);
  const loading = !report || report.month !== month;
  const data = loading ? null : report.data;
  const open = (id: number) => router.push({ pathname: '/especie/[id]', params: { id: String(id) } });

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
          <Icon name="back" />
        </Press>
        <Txt variant="title" accessibilityRole="header">
          Calendario
        </Txt>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space.xxxl }} showsVerticalScrollIndicator={false}>
        <Appear>
          <Txt variant="heading">{`Qué pasa en ${monthName(month)}`}</Txt>
          <Txt variant="body" tone="soft" style={styles.lead}>
            {near
              ? `En un radio de ${REGION_KM} km a tu alrededor.`
              : 'En todo el mundo: activa la ubicación (al fichar un avistamiento) para ver tu región.'}
          </Txt>
        </Appear>

        <Appear index={1} style={styles.block}>
          <Card padding="md">
            <MonthStrip activity={norm} selected={month} current={today} onSelect={setMonth} />
            <Txt variant="small" tone="faint" style={styles.cap}>
              {activity
                ? `Altura de cada barra: observaciones de animales en ese mes (el pico son ${fmtInt(Math.max(...activity))}). Mide también cuánta gente sale a mirar.`
                : 'Cargando la actividad del año…'}
            </Txt>
          </Card>
        </Appear>

        {loading ? (
          <ActivityIndicator color={palette.brand} style={{ marginTop: space.xl }} />
        ) : !data ? (
          <Card tone="tint" tint={palette.surfaceAlt} style={styles.block}>
            <Txt variant="subheading">Sin conexión y sin datos guardados</Txt>
            <Txt variant="small" tone="soft">
              El calendario se calcula con iNaturalist; vuelve cuando tengas cobertura.
            </Txt>
          </Card>
        ) : (
          <>
            <List title="En pico este mes" icon="sun" accent={palette.brandInk} tint={palette.brandTint} entries={data.peak} detail={(e) => `${fmtInt(e.count)} obs. · ${(Math.round(e.ratio * 10) / 10).toLocaleString('es-ES')}× lo normal`} onOpen={open} empty="Ninguna especie destaca claramente este mes." index={2} />
            {data.migratory.length > 0 ? (
              <List title="Migradoras que se dejan ver" icon="wave" accent={palette.sky} tint={palette.skyTint} entries={data.migratory} detail={(e) => e.migration ?? ''} onOpen={open} empty="" index={3} />
            ) : null}
            <List title={`Aparecen frente a ${monthName(month === 1 ? 12 : month - 1)}`} icon="sparkle" accent={palette.leaf} tint={palette.leafTint} entries={data.arriving} detail={(e) => `${fmtInt(e.prev)} → ${fmtInt(e.count)} obs.`} onOpen={open} empty="No hay novedades claras respecto al mes pasado." index={4} />
            <List title="Se despiden" icon="moon" accent={palette.inkSoft} tint={palette.surfaceAlt} entries={data.leaving} detail={(e) => `${fmtInt(e.prev)} → ${fmtInt(e.count)} obs.`} onOpen={open} empty="Ninguna desaparece de golpe." index={5} />
            <Txt variant="small" tone="faint" style={styles.block}>
              Datos: observaciones confirmadas en libertad de iNaturalist y migración del catálogo. «En pico»: el mes reúne al
              menos el doble de observaciones que un mes normal de esa especie; «aparecen»/«se despiden»: al menos 3 veces más o
              menos que el mes anterior. Solo se cuentan especies con 8 o más observaciones.
            </Txt>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function List({
  title,
  icon,
  accent,
  tint,
  entries,
  detail,
  onOpen,
  empty,
  index,
}: {
  title: string;
  icon: IconName;
  accent: string;
  tint: string;
  entries: CalendarEntry[];
  detail: (e: CalendarEntry) => string;
  onOpen: (id: number) => void;
  empty: string;
  index: number;
}) {
  return (
    <Appear index={index}>
      <Section title={title} icon={icon} accent={accent} tint={tint}>
        {entries.length === 0 ? (
          <Txt variant="body" tone="soft">
            {empty}
          </Txt>
        ) : (
          <Card tone="outline" padding="md">
            {entries.map((e) => (
              <Row key={e.id} entry={e} detail={detail(e)} onOpen={onOpen} />
            ))}
          </Card>
        )}
      </Section>
    </Appear>
  );
}

function Row({ entry, detail, onOpen }: { entry: CalendarEntry; detail: string; onOpen: (id: number) => void }) {
  const dn = displayName(entry.species);
  const g = groupColor(entry.species.grp);
  return (
    <Press onPress={() => onOpen(entry.id)} accessibilityRole="button" accessibilityLabel={`${dn.name}: ${detail}`} style={styles.row}>
      <FadeImage source={listThumb(entry.species.img)} placeholderColor={g.tint} contentFit="cover" style={styles.thumb} />
      <View style={styles.flex}>
        <Txt variant="bodyStrong" numberOfLines={1} style={dn.isSci ? { fontStyle: 'italic' } : undefined}>
          {dn.name}
        </Txt>
        <Txt variant="small" tone="soft" numberOfLines={1}>
          {detail}
        </Txt>
      </View>
      <Icon name={entry.species.grp as IconName} size={20} color={g.color} />
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: GUTTER, paddingBottom: space.md },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  lead: { marginTop: space.xs },
  block: { marginTop: space.xl },
  cap: { marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64 },
  thumb: { width: 52, height: 52, borderRadius: radius.md },
});
