import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreedLine } from '@/components/BreedLine';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import {
  breedTotals,
  countBreeds,
  getSpecies,
  listBreeds,
  type Authority,
  type BreedQuery,
  type BreedRow,
} from '@/db/catalog';
import { COUNTRY_NAME } from '@/lib/countries';
import { fmtInt } from '@/lib/format';
import { AUTHORITY_LABEL } from '@/lib/groups';
import { useUserCountry } from '@/lib/location';
import { radius, space, type, usePalette } from '@/theme';

const PAGE = 60;

type Page = { key: string; rows: BreedRow[]; total: number | null; done: boolean };

/** Todas las razas reconocidas de una especie, con buscador. */
export default function Razas() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const speciesId = Number(id);
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const userCc = useUserCountry();

  const [name, setName] = useState('');
  const [totals, setTotals] = useState<Partial<Record<Authority, number>>>({});
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    getSpecies(speciesId).then((sp) => setName(sp ? (sp.name_es ?? sp.sci) : ''));
    breedTotals(speciesId).then(setTotals);
  }, [speciesId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 180);
    return () => clearTimeout(t);
  }, [q]);

  const query: BreedQuery = useMemo(
    () => ({ q: debouncedQ, authority, cc: onlyMine && userCc ? userCc : null }),
    [debouncedQ, authority, onlyMine, userCc],
  );
  const key = JSON.stringify(query);
  const [page, setPage] = useState<Page>({ key: '', rows: [], total: null, done: false });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([listBreeds(speciesId, query, PAGE, 0), countBreeds(speciesId, query)]).then(([rows, total]) => {
      if (alive) setPage({ key, rows, total, done: rows.length < PAGE });
    });
    return () => {
      alive = false;
    };
    // `query` entra a través de `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, speciesId]);

  const loadMore = useCallback(() => {
    if (page.key !== key || page.done || loadingMore) return;
    setLoadingMore(true);
    listBreeds(speciesId, query, PAGE, page.rows.length)
      .then((rows) => setPage((p) => (p.key === key ? { ...p, rows: [...p.rows, ...rows], done: rows.length < PAGE } : p)))
      .finally(() => setLoadingMore(false));
  }, [page, key, loadingMore, speciesId, query]);

  const open = useCallback((breedId: string) => router.push({ pathname: '/raza/[id]', params: { id: breedId } }), []);
  const authorities = (Object.keys(totals) as Authority[]).filter((a) => (totals[a] ?? 0) > 0);
  const total = page.key === key ? page.total : null;

  const header = (
    <View style={{ paddingTop: insets.top + space.sm }}>
      <View style={styles.top}>
        <Press onPress={() => router.back()} accessibilityLabel="Volver" style={styles.back}>
          <Icon name="back" size={22} color={palette.ink} />
        </Press>
      </View>
      <View style={styles.pad}>
        <Txt variant="data" tone="faint">
          Razas reconocidas
        </Txt>
        <Txt variant="title">{name}</Txt>
        <Txt variant="body" tone="soft" style={styles.lead}>
          {lead(authorities)}
        </Txt>

        <View style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <Icon name="search" size={20} color={palette.inkFaint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar una raza"
            placeholderTextColor={palette.inkFaint}
            style={[type.body, styles.input, { color: palette.ink }]}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Buscar una raza"
          />
          {q.length > 0 && (
            <Press onPress={() => setQ('')} accessibilityLabel="Borrar búsqueda" hitSlop={10}>
              <Icon name="close" size={18} color={palette.inkSoft} />
            </Press>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, styles.pad]}>
        {userCc && (
          <Chip
            label={`De ${COUNTRY_NAME[userCc] ?? userCc}`}
            on={onlyMine}
            onPress={() => setOnlyMine((v) => !v)}
          />
        )}
        {authorities.length > 1 &&
          authorities.map((a) => (
            <Chip
              key={a}
              label={`${AUTHORITY_LABEL[a]} · ${fmtInt(totals[a] ?? 0)}`}
              on={authority === a}
              onPress={() => setAuthority((cur) => (cur === a ? null : a))}
            />
          ))}
      </ScrollView>

      <View style={[styles.pad, styles.count]}>
        <Txt variant="small" tone="faint">
          {total === null ? 'Contando…' : total === 1 ? '1 raza' : `${fmtInt(total)} razas`}
        </Txt>
      </View>
    </View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <FlashList
        data={page.rows}
        keyExtractor={(b: BreedRow) => b.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={styles.pad}>
            <BreedLine breed={item} onPress={open} showAuthority={authorities.length > 1 && !authority} />
          </View>
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        ListEmptyComponent={
          total === 0 ? (
            <View style={[styles.empty, styles.pad, { borderColor: palette.line }]}>
              <Txt variant="body" tone="soft">
                Ninguna raza coincide. Prueba con otro nombre: muchas razas tienen varios.
              </Txt>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const WHO: Record<Authority, string> = {
  fci: 'la Federación Cinológica Internacional (FCI)',
  fife: 'la Federación Internacional Felina (FIFe)',
  fao: 'la FAO (DAD-IS), con los datos que registra cada país',
  mapa: 'el Catálogo Oficial de Razas de Ganado de España',
};

function lead(authorities: Authority[]): string {
  if (!authorities.length) return '';
  const who = authorities.map((a) => WHO[a]);
  const list = who.length > 1 ? `${who.slice(0, -1).join(', ')} y ${who[who.length - 1]}` : who[0];
  return `Solo razas reconocidas por ${list}. Las extinguidas no aparecen.`;
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[styles.chip, { backgroundColor: on ? palette.forest : palette.surface, borderColor: on ? palette.forest : palette.line }]}>
      <Txt variant="label" tone={on ? 'onForest' : 'ink'}>
        {label}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { paddingHorizontal: space.sm },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  pad: { paddingHorizontal: space.lg },
  lead: { marginTop: space.sm, marginBottom: space.lg },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1 },
  input: { flex: 1, paddingVertical: 0 },
  chips: { gap: space.sm, paddingVertical: space.md },
  chip: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center' },
  count: { paddingBottom: space.xs },
  empty: { marginTop: space.lg, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: space.xl },
});
