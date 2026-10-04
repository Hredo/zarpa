import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { TrailMark } from '@/components/TrailMark';
import { Txt } from '@/components/Txt';
import { getSpeciesByIds, groupTotals, type SpeciesRow } from '@/db/catalog';
import { fmtDate, fmtInt } from '@/lib/format';
import { GROUP_BY_CODE, type GroupCode } from '@/lib/groups';
import { listSightings, useJournal, type Sighting } from '@/store/journal';
import { radius, space, usePalette } from '@/theme';

/*
 * El cuaderno: las pegatinas de los animales que el usuario ha visto de verdad,
 * con su fecha y lugar. Las pegatinas no van en tarjetas: se pegan sobre la
 * página, cada una con un giro leve y fijo (sale de su id, así no baila al
 * volver a la pantalla).
 */
export default function Cuaderno() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const lastSightingAt = useJournal((s) => s.lastSightingAt);
  const caught = useJournal((s) => s.caught);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [species, setSpecies] = useState<Record<number, SpeciesRow>>({});
  const [totals, setTotals] = useState<{ code: string; label: string; total: number }[]>([]);

  useEffect(() => {
    listSightings(1000).then(async (rows) => {
      setSightings(rows);
      const ids = [...new Set(rows.map((r) => r.species_id).filter((x): x is number => x != null))];
      const sp = await getSpeciesByIds(ids);
      setSpecies(Object.fromEntries(sp.map((s) => [s.id, s])));
    });
    groupTotals().then(setTotals);
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

  const columns = width >= 700 ? 4 : 3;
  const cell = Math.floor((width - space.lg * 2) / columns);
  const verified = sightings.filter((s) => s.verified).length;

  const header = (
    <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg }}>
      <View style={styles.titleRow}>
        <Txt variant="title">Cuaderno</Txt>
        <Press onPress={() => router.push('/fuentes')} accessibilityLabel="Fuentes y créditos" style={[styles.iconBtn, { borderColor: palette.line }]}>
          <Icon name="info" size={20} />
        </Press>
      </View>
      <View style={styles.stats}>
        <Stat value={fmtInt(caught.size)} label="especies" />
        <Stat value={fmtInt(sightings.length)} label="avistamientos" />
        <Stat value={fmtInt(verified)} label="verificados por IA" />
      </View>

      {byGroup.size > 0 && (
        <View style={styles.groups}>
          {totals
            .filter((t) => byGroup.has(t.code))
            .map((t) => {
              const n = byGroup.get(t.code)?.size ?? 0;
              return (
                <View key={t.code} style={styles.groupRow}>
                  <Icon name={t.code as GroupCode} size={20} color={palette.inkSoft} />
                  <Txt variant="label" style={styles.groupLabel}>
                    {GROUP_BY_CODE[t.code as GroupCode]?.label ?? t.label}
                  </Txt>
                  <View style={[styles.track, { backgroundColor: palette.surfaceAlt }]}>
                    <View style={[styles.fillBar, { backgroundColor: palette.forest, width: `${Math.max(1.5, (n / t.total) * 100)}%` }]} />
                  </View>
                  <Txt variant="data" tone="faint" style={styles.groupCount}>
                    {fmtInt(n)}/{fmtInt(t.total)}
                  </Txt>
                </View>
              );
            })}
        </View>
      )}
      {sightings.length > 0 && (
        <Txt variant="heading" style={{ marginTop: space.xl, marginBottom: space.md }}>
          Pegatinas
        </Txt>
      )}
    </View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <FlashList
        data={sightings}
        numColumns={columns}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: space.xxxl, paddingHorizontal: space.lg }}
        renderItem={({ item }) => {
          const sp = item.species_id != null ? species[item.species_id] : undefined;
          const tilt = (parseInt(item.id.slice(0, 2), 16) % 9) - 4;
          return (
            <Press
              onPress={() => router.push({ pathname: '/avistamiento/[id]', params: { id: item.id } })}
              accessibilityLabel={sp ? (sp.name_es ?? sp.sci) : 'Avistamiento'}
              style={[styles.cell, { width: cell }]}>
              <Image
                source={item.sticker ?? item.photo}
                style={[styles.sticker, { width: cell - 12, height: cell - 12, transform: [{ rotate: `${tilt}deg` }] }]}
                contentFit="contain"
              />
              <Txt variant="label" numberOfLines={1} style={styles.cellName}>
                {sp ? (sp.name_es ?? sp.name_en ?? sp.sci) : 'Sin especie'}
              </Txt>
              <View style={styles.cellMeta}>
                {sp ? <TrailMark tier={sp.rarity} width={16} /> : null}
                <Txt variant="data" tone="faint" style={{ fontSize: 11 }}>
                  {fmtDate(item.created_at)}
                </Txt>
              </View>
            </Press>
          );
        }}
        ListEmptyComponent={
          <View style={[styles.empty, { borderColor: palette.lineStrong, marginHorizontal: 0 }]}>
            <Txt variant="heading">Páginas en blanco</Txt>
            <Txt variant="body" tone="soft">
              Cada animal que fiches con el visor se pega aquí con su foto, la fecha y el lugar. Es tuyo: se guarda en
              el móvil.
            </Txt>
            <Press haptic onPress={() => router.push('/avistar')} style={[styles.primary, { backgroundColor: palette.blaze, borderColor: palette.ink }]}>
              <Txt variant="bodyStrong" tone="onBlaze">
                Avistar el primero
              </Txt>
            </Press>
          </View>
        }
      />
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="dataLarge">{value}</Txt>
      <Txt variant="small" tone="faint">
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: space.xl, marginTop: space.lg },
  stat: { gap: 2 },
  groups: { marginTop: space.xl, gap: space.sm },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 28 },
  groupLabel: { width: 120 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fillBar: { height: 6, borderRadius: 3 },
  groupCount: { width: 92, textAlign: 'right' },
  cell: { alignItems: 'center', paddingBottom: space.lg },
  sticker: {},
  cellName: { marginTop: 2, maxWidth: '96%' },
  cellMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.xl, gap: space.sm, marginTop: space.lg },
  primary: { marginTop: space.sm, alignSelf: 'flex-start', height: 48, paddingHorizontal: space.xl, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
