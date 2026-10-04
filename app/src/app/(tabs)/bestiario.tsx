import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreedLine } from '@/components/BreedLine';
import { Cromo } from '@/components/Cromo';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { groupTotals, searchBreeds, type BreedRow, type SpeciesRow } from '@/db/catalog';
import { CATALOG_SPECIES } from '@/db/catalogAsset';
import { activeFilterCount } from '@/db/query';
import { fmtInt } from '@/lib/format';
import { GROUPS, type GroupCode } from '@/lib/groups';
import { useSpeciesList } from '@/lib/useSpeciesList';
import { useFilters } from '@/store/filters';
import { useJournal } from '@/store/journal';
import { radius, space, type, usePalette } from '@/theme';

const GUTTER = space.lg;
const GAP = space.md;

export default function Bestiario() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { filters, sort, set } = useFilters();
  const caught = useJournal((s) => s.caught);
  const { rows, total, loadMore } = useSpeciesList(filters, sort);
  const [totals, setTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    groupTotals().then((g) => setTotals(Object.fromEntries(g.map((x) => [x.code, x.total]))));
  }, []);

  // Razas que coinciden con la búsqueda («pastor alemán», «frisona»…): llevan a
  // su ficha oficial; la especie aparece además entre los cromos.
  const [breedHits, setBreedHits] = useState<{ q: string; rows: (BreedRow & { species_name: string | null })[] }>({ q: '', rows: [] });
  useEffect(() => {
    const q = filters.q.trim();
    if (q.length < 3) return;
    let alive = true;
    const t = setTimeout(() => {
      searchBreeds(q, 4).then((rows) => {
        if (alive) setBreedHits({ q, rows });
      });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [filters.q]);
  const shownBreeds = breedHits.q === filters.q.trim() ? breedHits.rows : [];

  const columns = width >= 700 ? 3 : 2;
  const cardW = Math.floor((width - GUTTER * 2 - GAP * (columns - 1)) / columns);
  const extraFilters = activeFilterCount({ ...filters, groups: [] });

  const open = useCallback((id: number) => router.push({ pathname: '/especie/[id]', params: { id: String(id) } }), []);

  const selectGroup = (code: GroupCode | null) => set({ groups: code ? [code] : [] });
  const selected = filters.groups.length === 1 ? filters.groups[0] : null;

  const header = (
    <View style={{ paddingTop: insets.top + space.md }}>
      <View style={[styles.titleRow, { paddingHorizontal: GUTTER }]}>
        <Txt variant="title">Bestiario</Txt>
        <View style={styles.tally}>
          <Txt variant="dataLarge">{fmtInt(caught.size)}</Txt>
          <Txt variant="data" tone="faint">
            de {fmtInt(CATALOG_SPECIES)} avistadas
          </Txt>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.albums, { paddingHorizontal: GUTTER }]}>
        <AlbumPill label="Todos" count={CATALOG_SPECIES} active={selected === null} onPress={() => selectGroup(null)} />
        {GROUPS.filter((g) => (totals[g.code] ?? 0) > 0).map((g) => (
          <AlbumPill
            key={g.code}
            icon={g.code}
            label={g.label}
            count={totals[g.code] ?? 0}
            active={selected === g.code}
            onPress={() => selectGroup(selected === g.code ? null : g.code)}
          />
        ))}
      </ScrollView>

      <View style={[styles.searchRow, { paddingHorizontal: GUTTER }]}>
        <View style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <Icon name="search" size={20} color={palette.inkFaint} />
          <TextInput
            value={filters.q}
            onChangeText={(q) => set({ q })}
            placeholder="Nombre común o científico"
            placeholderTextColor={palette.inkFaint}
            style={[type.body, styles.input, { color: palette.ink }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Buscar especie"
          />
          {filters.q.length > 0 && (
            <Press onPress={() => set({ q: '' })} accessibilityLabel="Borrar búsqueda" hitSlop={10}>
              <Icon name="close" size={18} color={palette.inkSoft} />
            </Press>
          )}
        </View>
        <Press
          onPress={() => router.push('/filtros')}
          accessibilityLabel={`Filtros${extraFilters ? `, ${extraFilters} activos` : ''}`}
          style={[
            styles.filterBtn,
            {
              backgroundColor: extraFilters ? palette.forest : palette.surface,
              borderColor: extraFilters ? palette.forest : palette.line,
            },
          ]}>
          <Icon name="filter" size={20} color={extraFilters ? palette.onForest : palette.ink} />
          {extraFilters > 0 && (
            <Txt variant="label" tone="onForest">
              {extraFilters}
            </Txt>
          )}
        </Press>
      </View>

      {shownBreeds.length > 0 && (
        <View style={[styles.breeds, { paddingHorizontal: GUTTER }]}>
          <Txt variant="label" tone="soft">
            Razas
          </Txt>
          {shownBreeds.map((b) => (
            <View key={b.id}>
              <BreedLine breed={b} onPress={(bid) => router.push({ pathname: '/raza/[id]', params: { id: bid } })} />
              <Txt variant="data" tone="faint" style={styles.breedOf}>
                {b.species_name}
              </Txt>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.resultRow, { paddingHorizontal: GUTTER }]}>
        <Txt variant="small" tone="faint">
          {total === null ? 'Contando…' : total === 1 ? '1 especie' : `${fmtInt(total)} especies`}
        </Txt>
      </View>
    </View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <FlashList
        data={rows}
        numColumns={columns}
        keyExtractor={(item: SpeciesRow) => String(item.id)}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: space.xxxl }}
        renderItem={({ item, index }) => (
          <View
            style={{
              paddingLeft: index % columns === 0 ? GUTTER : GAP / 2,
              paddingRight: index % columns === columns - 1 ? GUTTER : GAP / 2,
              paddingBottom: GAP,
            }}>
            <Cromo species={item} caught={caught.has(item.id)} width={cardW} onPress={open} />
          </View>
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          total === 0 ? (
            <View style={[styles.empty, { marginHorizontal: GUTTER, borderColor: palette.line }]}>
              <Txt variant="heading">Sin rastro</Txt>
              <Txt variant="body" tone="soft">
                Ninguna especie cumple a la vez la búsqueda y los filtros. Quita alguno para ampliar el rastro.
              </Txt>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function AlbumPill({
  icon,
  label,
  count,
  active,
  onPress,
}: {
  icon?: GroupCode;
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const fg = active ? palette.onForest : palette.ink;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.pill,
        { backgroundColor: active ? palette.forest : palette.surface, borderColor: active ? palette.forest : palette.line },
      ]}>
      {icon && <Icon name={icon} size={20} color={fg} />}
      <Txt variant="label" color={fg}>
        {label}
      </Txt>
      <Txt variant="data" color={active ? palette.onForestSoft : palette.inkFaint}>
        {fmtInt(count)}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  tally: { alignItems: 'flex-end' },
  albums: { gap: space.sm, paddingVertical: space.lg },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  searchRow: { flexDirection: 'row', gap: space.sm },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  input: { flex: 1, paddingVertical: 0 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 48,
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  resultRow: { paddingTop: space.md, paddingBottom: space.md },
  breeds: { paddingTop: space.lg },
  breedOf: { marginTop: -space.sm, marginBottom: space.xs, marginLeft: 56 + space.md },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.xl, gap: space.sm },
});
