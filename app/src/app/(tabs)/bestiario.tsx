import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreedLine } from '@/components/BreedLine';
import { Chip } from '@/components/Chip';
import { Cromo } from '@/components/Cromo';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { groupTotals, searchBreeds, type BreedRow, type SpeciesRow } from '@/db/catalog';
import { catalogInfo } from '@/db';
import { activeFilterCount, EMPTY_FILTERS, type SortKey } from '@/db/query';
import { fmtInt } from '@/lib/format';
import { GROUPS, type GroupCode } from '@/lib/groups';
import { useSpeciesList } from '@/lib/useSpeciesList';
import { useFilters } from '@/store/filters';
import { useJournal } from '@/store/journal';
import { elevation, groupColors, HIT, radius, space, type, usePalette } from '@/theme';

const GUTTER = space.lg;
const GAP = space.md;

const SORT_LABEL: Record<SortKey, string> = {
  album: 'Orden del álbum',
  popular: 'Más vistas',
  name: 'De la A a la Z',
  rarity: 'Más raras',
};

/*
 * Bestiario: el álbum entero. Arriba, lo que se hace más: buscar (grande y a la
 * vista), saltar de grupo con chips de color y abrir los filtros con el
 * recuento de los activos. La rejilla de cromos entra escalonada solo la
 * primera vez que se ve (las celdas de FlashList se reciclan: no se anima en
 * cada scroll ni al filtrar, que se hace decenas de veces).
 */
export default function Bestiario() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { filters, sort, set } = useFilters();
  const caught = useJournal((s) => s.caught);
  const { rows, total, loadMore } = useSpeciesList(filters, sort);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [focused, setFocused] = useState(false);

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
  const selectedLabel = selected ? GROUPS.find((g) => g.code === selected)?.label : null;

  const header = (
    <View style={{ paddingTop: insets.top + space.md }}>
      <View style={[styles.titleRow, { paddingHorizontal: GUTTER }]}>
        <View style={styles.flex}>
          <Txt variant="title">Bestiario</Txt>
          <Txt variant="body" tone="soft">
            {fmtInt(catalogInfo().species)} animales de todo el mundo
          </Txt>
        </View>
        <View style={[styles.tally, { backgroundColor: palette.brandTint }]}>
          <Txt variant="stat" color={palette.brandInk}>
            {fmtInt(caught.size)}
          </Txt>
          <Txt variant="small" color={palette.brandInk}>
            {caught.size === 1 ? 'avistada' : 'avistadas'}
          </Txt>
        </View>
      </View>

      <View style={[styles.searchRow, { paddingHorizontal: GUTTER }]}>
        <View
          style={[
            styles.search,
            elevation.card,
            { backgroundColor: palette.surface, borderColor: focused ? palette.strong : palette.line, borderWidth: focused ? 2 : 1 },
          ]}>
          <Icon name="search" size={22} color={palette.inkSoft} />
          <TextInput
            value={filters.q}
            onChangeText={(q) => set({ q })}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Busca un animal: gato, águila…"
            placeholderTextColor={palette.inkFaint}
            style={[type.body, styles.input, { color: palette.ink }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Buscar animal por nombre común o científico"
          />
          {filters.q.length > 0 && (
            <Press onPress={() => set({ q: '' })} accessibilityLabel="Borrar búsqueda" hitSlop={10} style={styles.clear}>
              <Icon name="close" size={18} color={palette.inkSoft} />
            </Press>
          )}
        </View>
        <Press
          onPress={() => router.push('/filtros')}
          accessibilityRole="button"
          accessibilityLabel={`Filtros y orden${extraFilters ? `, ${extraFilters} ${extraFilters === 1 ? 'activo' : 'activos'}` : ''}`}
          style={[
            styles.filterBtn,
            {
              backgroundColor: extraFilters ? palette.strong : palette.surface,
              borderColor: extraFilters ? palette.strong : palette.line,
            },
          ]}>
          <Icon name="filter" size={20} color={extraFilters ? palette.onStrong : palette.ink} />
          <Txt variant="label" color={extraFilters ? palette.onStrong : palette.ink}>
            Filtros
          </Txt>
          {extraFilters > 0 && (
            <View style={[styles.badge, { backgroundColor: palette.brand }]}>
              <Txt variant="label" tone="onBrand" style={styles.badgeText}>
                {extraFilters}
              </Txt>
            </View>
          )}
        </Press>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.albums, { paddingHorizontal: GUTTER }]}>
        <Chip label="Todos" count={fmtInt(catalogInfo().species)} selected={selected === null} onPress={() => selectGroup(null)} />
        {GROUPS.filter((g) => (totals[g.code] ?? 0) > 0).map((g) => (
          <Chip
            key={g.code}
            icon={g.code}
            label={g.label}
            count={fmtInt(totals[g.code] ?? 0)}
            color={groupColors[g.code]}
            selected={selected === g.code}
            onPress={() => selectGroup(selected === g.code ? null : g.code)}
          />
        ))}
      </ScrollView>

      {shownBreeds.length > 0 && (
        <View style={[styles.breeds, { paddingHorizontal: GUTTER }]}>
          <Txt variant="subheading">Razas</Txt>
          {shownBreeds.map((b) => (
            <View key={b.id}>
              <BreedLine breed={b} onPress={(bid) => router.push({ pathname: '/raza/[id]', params: { id: bid } })} />
              <Txt variant="small" tone="soft" style={styles.breedOf}>
                {b.species_name}
              </Txt>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.resultRow, { paddingHorizontal: GUTTER }]}>
        <Txt variant="bodyStrong" style={styles.flex} numberOfLines={1}>
          {total === null ? 'Contando…' : total === 1 ? '1 especie' : `${fmtInt(total)} especies`}
          {selectedLabel ? ` · ${selectedLabel}` : ''}
        </Txt>
        <Press onPress={() => router.push('/filtros')} accessibilityRole="button" accessibilityLabel={`Orden: ${SORT_LABEL[sort]}. Cambiar`} style={styles.sortBtn}>
          <Icon name="sort" size={18} color={palette.inkSoft} />
          <Txt variant="small" tone="soft">
            {SORT_LABEL[sort]}
          </Txt>
        </Press>
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
          // Sin animación de entrada: las celdas de FlashList se reciclan en cada scroll.
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
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          total === 0 ? (
            <View style={[styles.empty, { marginHorizontal: GUTTER, backgroundColor: palette.surface, borderColor: palette.line }]}>
              <View style={[styles.emptyIcon, { backgroundColor: palette.brandTint }]}>
                <Icon name="search" size={28} color={palette.brandInk} />
              </View>
              <Txt variant="heading">No hemos encontrado ningún animal</Txt>
              <Txt variant="body" tone="soft">
                {filters.q.trim() ? `Nada coincide con «${filters.q.trim()}» y los filtros elegidos.` : 'Ninguna especie cumple los filtros elegidos.'} Prueba con otro nombre o quita
                algún filtro.
              </Txt>
              <View style={styles.emptyActions}>
                {filters.q.length > 0 ? (
                  <Press onPress={() => set({ q: '' })} accessibilityRole="button" style={[styles.emptyBtn, { backgroundColor: palette.strong }]}>
                    <Txt variant="bodyStrong" tone="onStrong">
                      Borrar búsqueda
                    </Txt>
                  </Press>
                ) : null}
                {extraFilters > 0 || filters.groups.length > 0 ? (
                  <Press
                    onPress={() => set({ ...EMPTY_FILTERS, q: filters.q })}
                    accessibilityRole="button"
                    style={[styles.emptyBtn, { borderColor: palette.lineStrong, borderWidth: 1.5 }]}>
                    <Txt variant="bodyStrong">Quitar filtros</Txt>
                  </Press>
                ) : null}
              </View>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  tally: { alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg, minWidth: 72 },
  searchRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg, alignItems: 'center' },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 54,
    paddingLeft: space.md,
    paddingRight: space.xs,
    borderRadius: radius.lg,
  },
  input: { flex: 1, paddingVertical: 0, height: 54 },
  clear: { width: HIT - 4, height: HIT - 4, alignItems: 'center', justifyContent: 'center' },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: HIT,
    height: 54,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { fontSize: 12, lineHeight: 15 },
  albums: { gap: space.sm, paddingVertical: space.lg },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: HIT, paddingBottom: space.xs },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: HIT, paddingLeft: space.sm },
  breeds: { paddingBottom: space.sm, gap: space.xs },
  breedOf: { marginTop: -space.sm, marginBottom: space.xs, marginLeft: 56 + space.md },
  empty: { borderWidth: 1, borderRadius: radius.lg, padding: space.xl, gap: space.md, alignItems: 'flex-start' },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  emptyBtn: { height: HIT, paddingHorizontal: space.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
