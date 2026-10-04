import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { TrailMark } from '@/components/TrailMark';
import { Txt } from '@/components/Txt';
import { catalog } from '@/db';
import type { SortKey } from '@/db/query';
import { COUNTRIES, REGION_LABEL, type Region } from '@/lib/countries';
import { GROUPS, IUCN_LABEL, MEDIUM, RARITY } from '@/lib/groups';
import { useFilters } from '@/store/filters';
import { iucnColors, radius, space, type, usePalette } from '@/theme';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'album', label: 'Orden del álbum' },
  { key: 'popular', label: 'Más vistas' },
  { key: 'name', label: 'A–Z' },
  { key: 'rarity', label: 'Más raras' },
];

type Availability = { medium: boolean; diet: boolean; repro: boolean; domestic: boolean; envs: boolean };

export default function Filtros() {
  const palette = usePalette();
  const { filters, sort, set, setSort, reset } = useFilters();
  const [countryQuery, setCountryQuery] = useState('');
  const [avail, setAvail] = useState<Availability | null>(null);
  const [diets, setDiets] = useState<string[]>([]);
  const [repros, setRepros] = useState<string[]>([]);

  // Solo se ofrecen los filtros cuyo dato ya está verificado en el catálogo.
  useEffect(() => {
    const db = catalog();
    (async () => {
      const q = async (sql: string) => ((await db.getFirstAsync<{ x: number }>(sql))?.x ?? 0) > 0;
      setAvail({
        medium: await q('SELECT EXISTS(SELECT 1 FROM species WHERE medium != 0) AS x'),
        diet: await q('SELECT EXISTS(SELECT 1 FROM species WHERE diet IS NOT NULL) AS x'),
        repro: await q('SELECT EXISTS(SELECT 1 FROM species WHERE repro IS NOT NULL) AS x'),
        domestic: await q('SELECT EXISTS(SELECT 1 FROM species WHERE domestic = 1) AS x'),
        envs: await q('SELECT EXISTS(SELECT 1 FROM species WHERE envs != 0) AS x'),
      });
      setDiets((await db.getAllAsync<{ v: string }>('SELECT DISTINCT diet AS v FROM species WHERE diet IS NOT NULL ORDER BY v')).map((r) => r.v));
      setRepros((await db.getAllAsync<{ v: string }>('SELECT DISTINCT repro AS v FROM species WHERE repro IS NOT NULL ORDER BY v')).map((r) => r.v));
    })().catch(() => {});
  }, []);

  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const regionCountries = useMemo(() => {
    const m = new Map<Region, string[]>();
    for (const c of COUNTRIES) {
      if (!c.region) continue;
      if (!m.has(c.region)) m.set(c.region, []);
      m.get(c.region)!.push(c.cc);
    }
    return m;
  }, []);

  const matchingCountries = useMemo(() => {
    const q = countryQuery
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
    if (q.length < 2) return [];
    return COUNTRIES.filter((c) =>
      c.name
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .includes(q),
    ).slice(0, 8);
  }, [countryQuery]);

  const pending = avail
    ? [!avail.medium && 'medio', !avail.diet && 'alimentación', !avail.repro && 'reproducción', !avail.envs && 'ambientes (ciudad, bosque, selva…)'].filter(Boolean)
    : [];

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <View style={[styles.head, { borderBottomColor: palette.line }]}>
        <Txt variant="heading">Filtros</Txt>
        <View style={styles.headBtns}>
          <Press onPress={reset} style={styles.textBtn}>
            <Txt variant="label" tone="soft">
              Quitar todos
            </Txt>
          </Press>
          <Press onPress={() => router.back()} style={[styles.done, { backgroundColor: palette.forest }]}>
            <Txt variant="label" tone="onForest">
              Ver resultados
            </Txt>
          </Press>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Block title="Ordenar">
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} on={sort === s.key} onPress={() => setSort(s.key)} />
          ))}
        </Block>

        <Block title="Álbum">
          {GROUPS.map((g) => (
            <Chip
              key={g.code}
              label={g.label}
              on={filters.groups.includes(g.code)}
              onPress={() => set({ groups: toggleIn(filters.groups, g.code) })}
            />
          ))}
        </Block>

        <Block title="Mis cromos">
          <Chip label="Todas" on={filters.caught === 'any'} onPress={() => set({ caught: 'any' })} />
          <Chip label="Avistadas" on={filters.caught === 'caught'} onPress={() => set({ caught: 'caught' })} />
          <Chip label="Por avistar" on={filters.caught === 'missing'} onPress={() => set({ caught: 'missing' })} />
          <Chip label="Guardadas en el Atlas" on={filters.saved} onPress={() => set({ saved: !filters.saved })} />
        </Block>

        <Block title="Rareza de avistamiento">
          {RARITY.map((r) => (
            <Chip
              key={r.tier}
              label={r.label}
              on={filters.rarity.includes(r.tier)}
              onPress={() => set({ rarity: toggleIn(filters.rarity, r.tier) })}
              leading={<TrailMark tier={r.tier} width={18} />}
            />
          ))}
        </Block>

        <Block title="Amenaza (Lista Roja de la UICN)">
          {['CR', 'EN', 'VU', 'NT', 'LC', 'DD'].map((c) => (
            <Chip
              key={c}
              label={IUCN_LABEL[c]}
              on={filters.iucn.includes(c)}
              onPress={() => set({ iucn: toggleIn(filters.iucn, c) })}
              leading={<View style={[styles.dot, { backgroundColor: iucnColors[c].bg }]} />}
            />
          ))}
        </Block>

        <Block title="Dónde se puede ver">
          <View style={styles.wrapRow}>
            {(Object.keys(REGION_LABEL) as Region[]).map((r) => {
              const ccs = regionCountries.get(r) ?? [];
              const on = ccs.length > 0 && ccs.every((cc) => filters.countries.includes(cc));
              return (
                <Chip
                  key={r}
                  label={REGION_LABEL[r]}
                  on={on}
                  onPress={() =>
                    set({
                      countries: on
                        ? filters.countries.filter((cc) => !ccs.includes(cc))
                        : [...new Set([...filters.countries, ...ccs])],
                    })
                  }
                />
              );
            })}
          </View>
          <View style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.line }]}>
            <Icon name="search" size={18} color={palette.inkFaint} />
            <TextInput
              value={countryQuery}
              onChangeText={setCountryQuery}
              placeholder="Buscar un país"
              placeholderTextColor={palette.inkFaint}
              style={[type.body, styles.input, { color: palette.ink }]}
            />
          </View>
          <View style={styles.wrapRow}>
            {matchingCountries.map((c) => (
              <Chip
                key={c.cc}
                label={c.name}
                on={filters.countries.includes(c.cc)}
                onPress={() => set({ countries: toggleIn(filters.countries, c.cc) })}
              />
            ))}
            {filters.countries.length > 0 && filters.countries.length <= 12
              ? filters.countries
                  .filter((cc) => !matchingCountries.some((m) => m.cc === cc))
                  .map((cc) => (
                    <Chip
                      key={cc}
                      label={COUNTRIES.find((c) => c.cc === cc)?.name ?? cc}
                      on
                      onPress={() => set({ countries: toggleIn(filters.countries, cc) })}
                    />
                  ))
              : null}
          </View>
          <Txt variant="small" tone="faint">
            Una especie cuenta en un país si hay al menos 3 observaciones humanas allí en GBIF.
          </Txt>
        </Block>

        {avail?.medium && (
          <Block title="Medio">
            {MEDIUM.map((m) => (
              <Chip
                key={m.bit}
                label={m.label}
                on={(filters.media & m.bit) !== 0}
                onPress={() => set({ media: filters.media ^ m.bit })}
              />
            ))}
          </Block>
        )}
        {avail?.diet && (
          <Block title="Alimentación">
            {diets.map((d) => (
              <Chip key={d} label={d} on={filters.diets.includes(d)} onPress={() => set({ diets: toggleIn(filters.diets, d) })} />
            ))}
          </Block>
        )}
        {avail?.repro && (
          <Block title="Reproducción">
            {repros.map((d) => (
              <Chip key={d} label={d} on={filters.repro.includes(d)} onPress={() => set({ repro: toggleIn(filters.repro, d) })} />
            ))}
          </Block>
        )}
        {avail?.domestic && (
          <Block title="Origen">
            <Chip label="Todas" on={filters.domestic === 'any'} onPress={() => set({ domestic: 'any' })} />
            <Chip label="Domésticas" on={filters.domestic === 'domestic'} onPress={() => set({ domestic: 'domestic' })} />
            <Chip label="Silvestres" on={filters.domestic === 'wild'} onPress={() => set({ domestic: 'wild' })} />
          </Block>
        )}

        {pending.length > 0 && (
          <View style={[styles.pending, { borderColor: palette.lineStrong }]}>
            <Txt variant="label">En verificación</Txt>
            <Txt variant="small" tone="soft">
              Los filtros de {pending.join(', ')} aparecerán cuando esos datos estén contrastados en fuentes oficiales.
              No se rellenan con suposiciones.
            </Txt>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Txt variant="subheading">{title}</Txt>
      <View style={styles.wrapRow}>{children}</View>
    </View>
  );
}

function Chip({ label, on, onPress, leading }: { label: string; on: boolean; onPress: () => void; leading?: React.ReactNode }) {
  const palette = usePalette();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[
        styles.chip,
        { backgroundColor: on ? palette.forest : palette.surface, borderColor: on ? palette.forest : palette.line },
      ]}>
      {leading}
      <Txt variant="label" tone={on ? 'onForest' : 'ink'}>
        {label}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headBtns: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  textBtn: { padding: space.sm },
  done: { height: 40, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.lg, gap: space.xl, paddingBottom: space.xxxl },
  block: { gap: space.md },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 44, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1 },
  input: { flex: 1, paddingVertical: 0 },
  pending: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.lg, gap: space.xs },
});
