import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { OfflineSection } from '@/components/excursion/OfflineSection';
import { SpeciesLine } from '@/components/excursion/SpeciesLine';
import { GroupPill } from '@/components/GroupPill';
import { Icon } from '@/components/Icon';
import { Meter } from '@/components/Meter';
import { Appear } from '@/components/motion/Appear';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { getSpeciesByIds, type SpeciesRow } from '@/db/catalog';
import { dayPhase, PHASES, type DayPhase } from '@/lib/dayPhase';
import { loadCandidates, scoreCandidates } from '@/lib/excursionData';
import { fmtDuration, groupByGroup } from '@/lib/excursionLogic';
import { fmtAgo } from '@/lib/format';
import { GROUP_BY_CODE, type GroupCode } from '@/lib/groups';
import { currentLocation, placeName, useLastLocation, type Coords } from '@/lib/location';
import { monthName } from '@/lib/months';
import { useExcursion, type ExcursionSummary } from '@/store/excursion';
import { useJournal } from '@/store/journal';
import { groupColor, radius, space, usePalette } from '@/theme';

const GUTTER = space.lg;
const DEFAULT_TARGETS = 25;
const PER_GROUP = 5;
const MAX_LIST = 80;

/*
 * Modo excursión, en tres tiempos:
 *   1. Antes de salir: «qué puedes ver hoy aquí» según tu ubicación, el mes y la
 *      franja del día, agrupado por grupo animal con su probabilidad relativa; se
 *      eligen los objetivos y se puede descargar la zona para el campo.
 *   2. Durante: la lista de objetivos con la casilla «visto en esta salida»
 *      (también se marca sola al fichar esa especie).
 *   3. Al terminar: resumen animado.
 */
export default function Excursion() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { active, loaded } = useExcursion();
  const [summary, setSummary] = useState<ExcursionSummary | null>(null);

  useEffect(() => {
    if (!loaded) void useExcursion.getState().load();
  }, [loaded]);

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
          <Icon name="back" />
        </Press>
        <Txt variant="title" accessibilityRole="header">
          Excursión
        </Txt>
      </View>
      {!loaded ? (
        <ActivityIndicator color={palette.brand} style={{ marginTop: space.xxl }} />
      ) : summary ? (
        <SummaryView summary={summary} bottom={insets.bottom} />
      ) : active ? (
        <ActiveView bottom={insets.bottom} onFinished={setSummary} />
      ) : (
        <PlanView bottom={insets.bottom} />
      )}
    </View>
  );
}

/* --- 1. Antes de salir ------------------------------------------------------- */

function PlanView({ bottom }: { bottom: number }) {
  const palette = usePalette();
  const last = useLastLocation();
  const [manual, setManual] = useState<Coords | null>(null);
  const coords = manual ?? last;
  const key = coords ? `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}` : '';
  const month = new Date().getMonth() + 1;
  const [phase, setPhase] = useState<DayPhase>(dayPhase());
  const [place, setPlace] = useState<string | null>(null);
  const [data, setData] = useState<{ key: string; res: Awaited<ReturnType<typeof loadCandidates>> } | null>(null);
  const [chosen, setChosen] = useState<Set<number> | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const caught = useJournal((s) => s.caught);

  useEffect(() => {
    if (!coords) return;
    let alive = true;
    placeName(coords).then((n) => alive && setPlace(n));
    loadCandidates(coords, month).then((res) => alive && setData({ key, res }));
    return () => {
      alive = false;
    };
    // La posición entra por `key`: moverse unos metros no repite la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, month]);

  const res = data && data.key === key ? data.res : undefined; // undefined = cargando
  const scored = useMemo(() => (res ? scoreCandidates(res.items, res.maxCount, phase).slice(0, MAX_LIST) : []), [res, phase]);

  // Objetivos por defecto: los más probables que aún no tienes (hasta que el usuario toque alguno).
  const defaults = useMemo(
    () => new Set(scored.filter((c) => !caught.has(c.id)).slice(0, DEFAULT_TARGETS).map((c) => c.id)),
    // Solo se recalculan al cambiar los datos, no al fichar o cambiar de franja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [res],
  );
  const picked = chosen ?? defaults;

  const askLocation = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Sin ubicación', 'Sin saber dónde estás no puedo decirte qué verás. Actívala en los ajustes del móvil.');
      return;
    }
    const c = await currentLocation();
    if (c) setManual(c);
  }, []);

  const toggle = useCallback((id: number) => {
    setChosen((prev) => {
      const next = new Set(prev ?? defaults);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [defaults]);

  const start = async () => {
    if (picked.size === 0) return;
    const targets = scored.filter((c) => picked.has(c.id)).map((c) => ({ species_id: c.id, prob: c.p }));
    await useExcursion.getState().start({
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      place,
      month,
      phase,
      targets,
    });
  };

  const groups = useMemo(() => groupByGroup(scored), [scored]);
  const open2 = useCallback((id: number) => router.push({ pathname: '/especie/[id]', params: { id: String(id) } }), []);

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: bottom + 120 }} showsVerticalScrollIndicator={false}>
        <Appear>
          <Txt variant="heading">Qué puedes ver hoy aquí</Txt>
          <Txt variant="body" tone="soft" style={styles.lead}>
            {coords
              ? `${place ?? 'Cerca de ti'} · ${monthName(month)}. Especies con observaciones confirmadas en iNaturalist a menos de 10 km este mes del año.`
              : 'Dime dónde estás y te cuento qué especies se dejan ver cerca este mes.'}
          </Txt>
        </Appear>

        {!coords ? (
          <Card style={styles.block}>
            <Txt variant="subheading">Necesito tu ubicación</Txt>
            <Txt variant="small" tone="soft" style={styles.gapSm}>
              Solo se usa en tu móvil para consultar las especies de alrededor.
            </Txt>
            <Press haptic onPress={askLocation} style={[styles.btn, { backgroundColor: palette.brand }]}>
              <Icon name="locate" size={20} color={palette.onBrand} />
              <Txt variant="bodyStrong" tone="onBrand">
                Usar mi ubicación
              </Txt>
            </Press>
          </Card>
        ) : (
          <>
            <Txt variant="label" tone="soft" style={styles.blockLabel}>
              ¿Cuándo sales?
            </Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {PHASES.map((ph) => (
                <Chip
                  key={ph.code}
                  label={ph.label}
                  icon={ph.code === 'noche' ? 'moon' : 'sun'}
                  selected={phase === ph.code}
                  onPress={() => setPhase(ph.code)}
                  accessibilityLabel={`${ph.label}, ${ph.range}`}
                />
              ))}
            </ScrollView>

            {res === undefined ? (
              <ActivityIndicator color={palette.brand} style={{ marginTop: space.xl }} />
            ) : res === null ? (
              <Card tone="tint" tint={palette.surfaceAlt} style={styles.block}>
                <Txt variant="subheading">Sin conexión y sin datos guardados</Txt>
                <Txt variant="small" tone="soft" style={styles.gapSm}>
                  No puedo consultar iNaturalist ahora ni hay una consulta anterior de esta zona. Cuando tengas cobertura,
                  vuelve a abrir esta pantalla.
                </Txt>
              </Card>
            ) : scored.length === 0 ? (
              <Txt variant="body" tone="soft" style={styles.block}>
                No hay observaciones confirmadas de este mes cerca de ti.
              </Txt>
            ) : (
              <>
                {res.fromCache ? (
                  <Txt variant="small" tone="faint" style={styles.gapSm}>
                    {`Datos guardados ${fmtAgo(res.fetchedAt)}.`}
                  </Txt>
                ) : null}
                {groups.map((gr, gi) => {
                  const g = groupColor(gr.grp);
                  const expanded = open.has(gr.grp);
                  const shown = expanded ? gr.items : gr.items.slice(0, PER_GROUP);
                  return (
                    <Appear key={gr.grp} index={gi} style={styles.group}>
                      <View style={styles.groupHead}>
                        <GroupPill code={gr.grp as GroupCode} />
                        <Txt variant="small" tone="soft">
                          {`${gr.items.length} ${gr.items.length === 1 ? 'especie' : 'especies'}`}
                        </Txt>
                      </View>
                      <Card tone="outline" padding="md" style={{ borderColor: g.tint }}>
                        {shown.map((c) => (
                          <SpeciesLine
                            key={c.id}
                            species={c}
                            p={c.p}
                            checked={picked.has(c.id)}
                            checkLabel="Objetivo de la excursión"
                            onToggle={toggle}
                            onOpen={open2}
                            caught={caught.has(c.id)}
                          />
                        ))}
                        {gr.items.length > PER_GROUP ? (
                          <Press
                            onPress={() =>
                              setOpen((prev) => {
                                const next = new Set(prev);
                                if (next.has(gr.grp)) next.delete(gr.grp);
                                else next.add(gr.grp);
                                return next;
                              })
                            }
                            accessibilityRole="button"
                            style={styles.more}>
                            <Txt variant="bodyStrong" tone="sky">
                              {expanded ? 'Ver menos' : `Ver las ${gr.items.length - PER_GROUP} restantes`}
                            </Txt>
                          </Press>
                        ) : null}
                      </Card>
                    </Appear>
                  );
                })}
                <Txt variant="small" tone="faint" style={styles.block}>
                  La barra compara las especies entre sí: cuántas veces se vio cada una cerca de ti en este mes (escala
                  logarítmica) y, si el catálogo sabe cuándo está activa (diurna, nocturna, crepuscular), cuánto encaja con la
                  franja elegida. No es una promesa de verla: la gente observa más donde hay más gente.
                </Txt>
              </>
            )}

            <OfflineSection coords={coords} place={place} imgs={res ? scored.map((c) => c.img) : []} />
          </>
        )}
      </ScrollView>

      {coords && res && scored.length > 0 ? (
        <View style={[styles.cta, { paddingBottom: bottom + space.md, backgroundColor: palette.bg, borderTopColor: palette.line }]}>
          <Press haptic onPress={start} disabled={picked.size === 0} accessibilityRole="button" style={[styles.btn, { backgroundColor: palette.brand }]}>
            <Icon name="flag" size={20} color={palette.onBrand} />
            <Txt variant="bodyStrong" tone="onBrand">
              {`Empezar excursión · ${picked.size} objetivos`}
            </Txt>
          </Press>
        </View>
      ) : null}
    </View>
  );
}

/* --- 2. Durante la salida ---------------------------------------------------- */

function ActiveView({ bottom, onFinished }: { bottom: number; onFinished: (s: ExcursionSummary) => void }) {
  const palette = usePalette();
  const { active, targets } = useExcursion();
  const [rows, setRows] = useState<Record<number, SpeciesRow>>({});
  const [now, setNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      void useExcursion.getState().syncSightings();
    }, []),
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    getSpeciesByIds(targets.map((t) => t.species_id)).then((r) => setRows(Object.fromEntries(r.map((x) => [x.id, x]))));
  }, [targets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(
    () =>
      targets
        .filter((t) => rows[t.species_id])
        .map((t) => ({ ...rows[t.species_id], p: t.prob, seen: !!t.seen })),
    [targets, rows],
  );
  const groups = useMemo(() => groupByGroup(items), [items]);
  const seen = targets.filter((t) => t.seen).length;
  const toggle = useCallback((id: number) => void useExcursion.getState().toggleSeen(id), []);
  const caught = useJournal((s) => s.caught);

  if (!active) return null;
  const minutes = Math.max(0, Math.round((now - new Date(active.started_at).getTime()) / 60_000));

  const finish = () =>
    Alert.alert('¿Terminar la excursión?', `Llevas ${seen} de ${targets.length} objetivos.`, [
      { text: 'Seguir', style: 'cancel' },
      {
        text: 'Terminar',
        onPress: async () => {
          const s = await useExcursion.getState().finish();
          if (s) onFinished(s);
        },
      },
    ]);

  const discard = () =>
    Alert.alert('¿Descartar la excursión?', 'Se borra esta salida y su lista de objetivos. Tus avistamientos no se tocan.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => void useExcursion.getState().discard() },
    ]);

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: bottom + 140 }} showsVerticalScrollIndicator={false}>
        <Appear>
          <Card tone="tint" tint={palette.leafTint}>
            <Txt variant="subheading">{active.place ?? 'Excursión en curso'}</Txt>
            <Txt variant="small" tone="soft">
              {`${monthName(active.month)} · lleva ${fmtDuration(minutes)}`}
            </Txt>
            <Meter value={targets.length ? seen / targets.length : 0} color={palette.leaf} trackColor={palette.surface} label="Objetivos vistos" valueLabel={`${seen} de ${targets.length}`} style={styles.gapSm} />
          </Card>
        </Appear>

        {groups.map((gr, gi) => (
          <Appear key={gr.grp} index={gi} style={styles.group}>
            <View style={styles.groupHead}>
              <GroupPill code={gr.grp as GroupCode} />
              <Txt variant="small" tone="soft">
                {`${gr.items.filter((i) => i.seen).length} de ${gr.items.length}`}
              </Txt>
            </View>
            <Card tone="outline" padding="md">
              {gr.items.map((c) => (
                <SpeciesLine
                  key={c.id}
                  species={c}
                  p={c.p}
                  checked={c.seen}
                  checkLabel="Visto en esta salida"
                  onToggle={toggle}
                  onOpen={(id) => router.push({ pathname: '/especie/[id]', params: { id: String(id) } })}
                  caught={caught.has(c.id)}
                />
              ))}
            </Card>
          </Appear>
        ))}

        <Press onPress={discard} accessibilityRole="button" style={styles.more}>
          <Txt variant="bodyStrong" tone="danger">
            Descartar esta excursión
          </Txt>
        </Press>
      </ScrollView>

      <View style={[styles.cta, styles.ctaRow, { paddingBottom: bottom + space.md, backgroundColor: palette.bg, borderTopColor: palette.line }]}>
        <Press haptic onPress={() => router.push('/avistar')} accessibilityRole="button" style={[styles.btn, styles.flex, { backgroundColor: palette.brand }]}>
          <Icon name="avistar" size={20} color={palette.onBrand} />
          <Txt variant="bodyStrong" tone="onBrand">
            Avistar
          </Txt>
        </Press>
        <Press haptic onPress={finish} accessibilityRole="button" style={[styles.btn, styles.flex, { backgroundColor: palette.strong }]}>
          <Icon name="check" size={20} color={palette.onStrong} />
          <Txt variant="bodyStrong" tone="onStrong">
            Terminar
          </Txt>
        </Press>
      </View>
    </View>
  );
}

/* --- 3. Resumen ---------------------------------------------------------------- */

function SummaryView({ summary, bottom }: { summary: ExcursionSummary; bottom: number }) {
  const palette = usePalette();
  const [rows, setRows] = useState<Record<number, SpeciesRow>>({});
  useEffect(() => {
    getSpeciesByIds(summary.targets.map((t) => t.species_id)).then((r) => setRows(Object.fromEntries(r.map((x) => [x.id, x]))));
  }, [summary]);

  const byGroup = useMemo(() => {
    const m = new Map<string, { seen: number; total: number }>();
    for (const t of summary.targets) {
      const grp = rows[t.species_id]?.grp;
      if (!grp) continue;
      const cur = m.get(grp) ?? { seen: 0, total: 0 };
      cur.total += 1;
      if (t.seen) cur.seen += 1;
      m.set(grp, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].seen - a[1].seen || b[1].total - a[1].total);
  }, [summary, rows]);

  const seenNames = summary.targets.filter((t) => t.seen && rows[t.species_id]);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: bottom + space.xxxl }} showsVerticalScrollIndicator={false}>
      <Appear>
        <Card tone="tint" tint={palette.leafTint} style={styles.center}>
          <Txt variant="label" tone="soft">
            Objetivos vistos
          </Txt>
          <View style={styles.big}>
            <AnimatedNumber value={summary.seen} variant="hero" />
            <Txt variant="title" tone="soft">{` / ${summary.total}`}</Txt>
          </View>
          <Meter value={summary.ratio} color={palette.leaf} trackColor={palette.surface} height={12} style={styles.fullWidth} delay={150} />
          <Txt variant="body" tone="soft" align="center" style={styles.gapSm}>
            {summary.seen === 0
              ? 'Hoy no hubo suerte con la lista, pero salir ya es ganar.'
              : summary.ratio >= 0.5
                ? 'Gran salida: viste más de la mitad de lo que buscabas.'
                : 'Buena salida. El campo no se deja ver a pedido.'}
          </Txt>
        </Card>
      </Appear>

      <Appear index={1} style={styles.tiles}>
        <StatTile icon="hourglass" value={summary.minutes} unit="min" label="Duración" color={palette.sky} tint={palette.skyTint} delay={200} style={styles.tile} />
        <StatTile icon="sparkle" value={summary.newSpecies} label="Nuevas en tu álbum" color={palette.brandInk} tint={palette.brandTint} delay={260} style={styles.tile} />
        <StatTile icon="eye" value={summary.extras} label="Fuera de la lista" color={palette.leaf} tint={palette.leafTint} delay={320} style={styles.tile} />
      </Appear>

      {byGroup.length > 0 ? (
        <Appear index={2}>
          <Section title="Por grupo" icon="layers" accent={palette.sky} tint={palette.skyTint}>
            <Card>
              <View style={styles.groupsList}>
                {byGroup.map(([grp, v], i) => (
                  <Meter
                    key={grp}
                    value={v.total ? v.seen / v.total : 0}
                    color={groupColor(grp).color}
                    label={GROUP_BY_CODE[grp as GroupCode]?.label ?? grp}
                    valueLabel={`${v.seen} de ${v.total}`}
                    delay={300 + i * 45}
                  />
                ))}
              </View>
            </Card>
          </Section>
        </Appear>
      ) : null}

      {seenNames.length > 0 ? (
        <Appear index={3}>
          <Section title="Lo que viste" icon="check" accent={palette.leaf} tint={palette.leafTint}>
            <Card tone="outline" padding="md">
              {seenNames.map((t) => {
                const sp = rows[t.species_id];
                return (
                  <SpeciesLine
                    key={t.species_id}
                    species={sp}
                    p={t.prob}
                    checked
                    checkLabel="Vista"
                    onToggle={() => {}}
                    onOpen={(id) => router.push({ pathname: '/especie/[id]', params: { id: String(id) } })}
                  />
                );
              })}
            </Card>
          </Section>
        </Appear>
      ) : null}

      <Press haptic onPress={() => router.back()} accessibilityRole="button" style={[styles.btn, styles.done, { backgroundColor: palette.strong }]}>
        <Txt variant="bodyStrong" tone="onStrong">
          Listo
        </Txt>
      </Press>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: GUTTER, paddingBottom: space.md },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  lead: { marginTop: space.xs },
  block: { marginTop: space.xl },
  blockLabel: { marginTop: space.xl },
  gapSm: { marginTop: space.sm },
  chips: { gap: space.sm, paddingTop: space.sm, paddingRight: GUTTER },
  group: { marginTop: space.xl },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: space.xs },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 56, borderRadius: radius.pill, paddingHorizontal: space.xl },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: space.md, borderTopWidth: 1 },
  ctaRow: { flexDirection: 'row', gap: space.md },
  center: { alignItems: 'center', gap: space.xs },
  big: { flexDirection: 'row', alignItems: 'baseline' },
  fullWidth: { alignSelf: 'stretch', marginTop: space.md },
  tiles: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  tile: { flex: 1 },
  groupsList: { gap: space.md },
  done: { marginTop: space.xxl },
});
