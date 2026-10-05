import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Meter } from '@/components/Meter';
import { Appear } from '@/components/motion/Appear';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { FadeImage } from '@/components/motion/FadeImage';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { StatTile } from '@/components/StatTile';
import { TrailMark } from '@/components/TrailMark';
import { Txt } from '@/components/Txt';
import { getSpeciesByIds, groupTotals, type SpeciesRow } from '@/db/catalog';
import { catalogInfo } from '@/db';
import { fmtDate, fmtInt } from '@/lib/format';
import { GROUP_BY_CODE, GROUPS, type GroupCode } from '@/lib/groups';
import { displayName } from '@/lib/speciesName';
import { useFilters } from '@/store/filters';
import { listSightings, useJournal, type Sighting } from '@/store/journal';
import { elevation, groupColor, HIT, radius, space, usePalette } from '@/theme';

const GUTTER = space.lg;

/*
 * Cuaderno: tu álbum. Arriba el progreso total y por grupo (cada barra con el
 * color de su grupo, pulsable para ver ese álbum en el Bestiario) y debajo las
 * pegatinas que has ido ganando, recientes primero. Sin avistamientos, un
 * estado vacío que invita a salir con la cámara.
 */
export default function Cuaderno() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const lastSightingAt = useJournal((s) => s.lastSightingAt);
  const caught = useJournal((s) => s.caught);
  const setFilters = useFilters((s) => s.set);
  const [loaded, setLoaded] = useState(false);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [species, setSpecies] = useState<Record<number, SpeciesRow>>({});
  const [totals, setTotals] = useState<{ code: string; label: string; total: number }[]>([]);

  useEffect(() => {
    let alive = true;
    listSightings(1000).then(async (rows) => {
      const ids = [...new Set(rows.map((r) => r.species_id).filter((x): x is number => x != null))];
      const sp = await getSpeciesByIds(ids);
      if (!alive) return;
      setSightings(rows);
      setSpecies(Object.fromEntries(sp.map((s) => [s.id, s])));
      setLoaded(true);
    });
    groupTotals().then((t) => alive && setTotals(t));
    return () => {
      alive = false;
    };
  }, [lastSightingAt]);

  const byGroup = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const id of caught.keys()) {
      const sp = species[id];
      if (!sp) continue;
      if (!m.has(sp.grp)) m.set(sp.grp, new Set());
      m.get(sp.grp)!.add(id);
    }
    return m;
  }, [caught, species]);

  const openGroup = useCallback(
    (code: GroupCode) => {
      setFilters({ groups: [code], q: '' });
      router.navigate('/bestiario');
    },
    [setFilters],
  );

  const columns = width >= 700 ? 4 : 3;
  const cell = Math.floor((width - GUTTER * 2) / columns);
  const verified = sightings.filter((s) => s.verified).length;
  const started = totals.filter((t) => byGroup.has(t.code));
  const pending = GROUPS.filter((g) => !byGroup.has(g.code) && totals.some((t) => t.code === g.code));
  const hasAny = sightings.length > 0;

  const header = (
    <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: GUTTER }}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Txt variant="title">Cuaderno</Txt>
          <Txt variant="body" tone="soft">
            Tu álbum de animales vistos
          </Txt>
        </View>
        <Press
          onPress={() => router.push('/fuentes')}
          accessibilityRole="button"
          accessibilityLabel="Fuentes y créditos"
          style={[styles.iconBtn, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <Icon name="info" size={22} color={palette.inkSoft} />
        </Press>
      </View>

      {hasAny ? (
        <>
          <Appear from="none">
            <Card style={styles.heroCard}>
              <View style={styles.heroTop}>
                <AnimatedNumber value={caught.size} variant="hero" />
                <Txt variant="body" tone="soft" style={styles.heroOf}>
                  {caught.size === 1 ? 'especie' : 'especies'} de {fmtInt(catalogInfo().species)}
                </Txt>
              </View>
              <Meter value={Math.max(caught.size / catalogInfo().species, 0.015)} color={palette.brand} height={12} style={styles.heroMeter} />
            </Card>
          </Appear>
          <View style={styles.tiles}>
            <StatTile icon="eye" value={sightings.length} label="avistamientos" color={palette.sky} tint={palette.skyTint} delay={100} />
            <StatTile icon="check" value={verified} label="verificados por la IA" color={palette.leaf} tint={palette.leafTint} delay={160} />
          </View>

          <Section title="Tu álbum por grupos" icon="bestiario" accent={palette.ink} tint={palette.strongTint}>
            <View style={styles.groups}>
              {started.map((t, i) => {
                const code = t.code as GroupCode;
                const g = groupColor(code);
                const n = byGroup.get(t.code)?.size ?? 0;
                const label = GROUP_BY_CODE[code]?.label ?? t.label;
                return (
                  <Press
                    key={t.code}
                    onPress={() => openGroup(code)}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}: ${n} de ${t.total}. Ver en el Bestiario`}
                    style={styles.groupRow}>
                    <View style={[styles.groupIcon, { backgroundColor: g.tint }]}>
                      <Icon name={code} size={22} color={g.color} strokeWidth={2} />
                    </View>
                    <Meter
                      style={styles.flex}
                      label={label}
                      valueLabel={`${fmtInt(n)} de ${fmtInt(t.total)}`}
                      value={Math.max(n / t.total, 0.02)}
                      color={g.color}
                      delay={i * 60}
                    />
                  </Press>
                );
              })}
            </View>
            {pending.length > 0 ? (
              <View style={styles.pendingBlock}>
                <Txt variant="small" tone="soft">
                  Aún por descubrir
                </Txt>
                <View style={styles.pendingRow}>
                  {pending.map((g) => {
                    const c = groupColor(g.code);
                    return (
                      <Press
                        key={g.code}
                        onPress={() => openGroup(g.code)}
                        accessibilityRole="button"
                        accessibilityLabel={`${g.label}, sin avistar. Ver en el Bestiario`}
                        style={[styles.pendingChip, { backgroundColor: c.tint }]}>
                        <Icon name={g.code} size={22} color={c.color} strokeWidth={2} />
                      </Press>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </Section>

          <View style={styles.stickerHead}>
            <Txt variant="heading">Tus pegatinas</Txt>
            <Txt variant="small" tone="soft">
              Recientes primero
            </Txt>
          </View>
        </>
      ) : null}
    </View>
  );

  const empty = loaded ? (
    <View style={styles.emptyWrap}>
      <Card tone="tint" tint={palette.brandTint} padding="xl" style={styles.emptyCard}>
        <View style={styles.emptyLogo}>
          <View style={[styles.emptyDisc, { backgroundColor: palette.surface }]}>
            <Logo size={64} />
          </View>
        </View>
        <Txt variant="title" align="center">
          Tu álbum espera su primera pegatina
        </Txt>
        <Txt variant="body" tone="soft" align="center">
          Apunta con la cámara a cualquier animal: la IA lo reconoce y se pega aquí con su foto, la fecha y el lugar. Se guarda en tu móvil.
        </Txt>
        <Press
          haptic
          onPress={() => router.push('/avistar')}
          accessibilityRole="button"
          style={[styles.primary, elevation.card, { backgroundColor: palette.brand }]}>
          <Icon name="avistar" size={22} color={palette.onBrand} strokeWidth={2.2} />
          <Txt variant="bodyStrong" tone="onBrand">
            Avistar mi primer animal
          </Txt>
        </Press>
        <Press
          onPress={() => router.navigate('/bestiario')}
          accessibilityRole="button"
          style={styles.secondary}>
          <Txt variant="bodyStrong" color={palette.brandInk}>
            Explorar el Bestiario
          </Txt>
        </Press>
      </Card>
      <Txt variant="small" tone="soft" align="center" style={styles.emptyHint}>
        {fmtInt(GROUPS.length)} álbumes por llenar
      </Txt>
      <View style={styles.emptyGroups}>
        {GROUPS.map((g) => {
          const c = groupColor(g.code);
          return (
            <View key={g.code} style={[styles.pendingChip, { backgroundColor: c.tint }]} accessibilityLabel={g.label}>
              <Icon name={g.code} size={22} color={c.color} strokeWidth={2} />
            </View>
          );
        })}
      </View>
    </View>
  ) : null;

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <FlashList
        data={sightings}
        numColumns={columns}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: space.xxxl, paddingHorizontal: GUTTER }}
        renderItem={({ item }) => {
          const sp = item.species_id != null ? species[item.species_id] : undefined;
          const nm = sp ? displayName(sp) : null;
          const g = groupColor(sp?.grp);
          const tilt = (parseInt(item.id.slice(0, 2), 16) % 9) - 4;
          const pad = 6;
          return (
            <Press
              onPress={() => router.push({ pathname: '/avistamiento/[id]', params: { id: item.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${nm?.name ?? 'Avistamiento'}, ${fmtDate(item.created_at)}`}
              style={[styles.cell, { width: cell }]}>
              <View style={[styles.stickerBack, { width: cell - pad * 2, height: cell - pad * 2, backgroundColor: g.tint }]}>
                <FadeImage
                  source={item.sticker ?? item.photo}
                  style={{ width: cell - 24, height: cell - 24, transform: [{ rotate: `${tilt}deg` }] }}
                  contentFit="contain"
                  placeholderColor="transparent"
                />
              </View>
              <Txt variant="label" numberOfLines={1} style={[styles.cellName, nm?.isSci ? styles.italic : null]}>
                {nm?.name ?? 'Sin especie'}
              </Txt>
              <View style={styles.cellMeta}>
                {sp ? <TrailMark tier={sp.rarity} width={16} /> : null}
                <Txt variant="small" tone="soft" numberOfLines={1}>
                  {fmtDate(item.created_at)}
                </Txt>
              </View>
            </Press>
          );
        }}
        ListEmptyComponent={empty}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  italic: { fontStyle: 'italic' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  iconBtn: { width: HIT, height: HIT, borderRadius: HIT / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heroCard: { marginTop: space.xl },
  heroTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  heroOf: { flexShrink: 1 },
  heroMeter: { marginTop: space.md },
  tiles: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  groups: { gap: space.lg },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: HIT },
  groupIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  pendingBlock: { marginTop: space.xl, gap: space.sm },
  pendingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pendingChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stickerHead: { marginTop: space.xxl, marginBottom: space.md, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cell: { alignItems: 'center', paddingBottom: space.lg },
  stickerBack: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  cellName: { marginTop: space.xs + 2, maxWidth: '96%' },
  cellMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, maxWidth: '96%' },
  emptyWrap: { marginTop: space.xl },
  emptyCard: { gap: space.md, alignItems: 'stretch' },
  emptyLogo: { alignItems: 'center', marginBottom: space.sm },
  emptyDisc: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  primary: { flexDirection: 'row', gap: space.sm, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  secondary: { height: HIT, alignItems: 'center', justifyContent: 'center' },
  emptyHint: { marginTop: space.xl },
  emptyGroups: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.md },
});
