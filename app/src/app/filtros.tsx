import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import { Icon, type IconName } from '@/components/Icon';
import { Press } from '@/components/Press';
import { TrailMark } from '@/components/TrailMark';
import { Txt } from '@/components/Txt';
import { catalog } from '@/db';
import { countSpecies, groupTotals } from '@/db/catalog';
import { activeFilterCount, type SortKey } from '@/db/query';
import { COUNTRIES, REGION_LABEL, type Region } from '@/lib/countries';
import { fmtInt } from '@/lib/format';
import { DIETS, ENVS, GROUPS, IUCN_LABEL, MEDIUM, RARITY } from '@/lib/groups';
import { useFilters } from '@/store/filters';
import { useJournal } from '@/store/journal';
import { elevation, groupColors, iucnColors, radius, space, type, usePalette } from '@/theme';

/*
 * Filtros del Bestiario.
 *
 * Pantalla completa (no hoja): cabecera y botón de resultados FIJOS y una sola
 * lista que se desplaza en medio. Una hoja con detents (`formSheet`) pelea con
 * el scroll interior: al llegar al final, el gesto de la hoja se queda el
 * arrastre hacia abajo y la lista ya no se puede volver a subir. Aquí no hay
 * gesto de hoja que compita, así que funciona igual en Android e iOS.
 */

const SORTS: { key: SortKey; label: string; icon: IconName }[] = [
  { key: 'album', label: 'Orden del álbum', icon: 'bestiario' },
  { key: 'popular', label: 'Más vistas', icon: 'eye' },
  { key: 'name', label: 'De la A a la Z', icon: 'sort' },
  { key: 'rarity', label: 'Más raras', icon: 'star' },
];

/** Cuántas especies tienen verificado cada dato: el filtro solo las abarca a ellas. */
type Availability = { medium: number; diet: number; repro: number; domestic: number; envs: number; envBits: number };

const strip = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export default function Filtros() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { filters, sort, set, setSort, reset } = useFilters();
  const caught = useJournal((s) => s.caught);
  const saved = useJournal((s) => s.saved);
  const [countryQuery, setCountryQuery] = useState('');
  const [avail, setAvail] = useState<Availability | null>(null);
  const [diets, setDiets] = useState<string[]>([]);
  const [repros, setRepros] = useState<string[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [count, setCount] = useState<number | null>(null);

  // Solo se ofrecen los filtros cuyo dato ya está verificado en el catálogo.
  useEffect(() => {
    catalog()
      .getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'coverage'")
      .then((row) => {
        if (!row) return;
        const c = JSON.parse(row.value) as Availability & { diets: string[]; repros: string[] };
        setAvail(c);
        setDiets(DIETS.map((d) => d.label).filter((d) => c.diets.includes(d)));
        setRepros([...c.repros].sort());
      })
      .catch(() => {});
    groupTotals()
      .then((g) => setTotals(Object.fromEntries(g.map((x) => [x.code, x.total]))))
      .catch(() => {});
  }, []);

  // Recuento en vivo: la consulta real, con los mismos filtros que usará el Bestiario.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      countSpecies(filters, { caughtIds: [...caught.keys()], savedIds: [...saved.keys()] })
        .then((n) => alive && setCount(n))
        .catch(() => {});
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [filters, caught, saved]);

  const active = activeFilterCount(filters) + (sort !== 'album' ? 1 : 0);

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

  const indexed = useMemo(() => COUNTRIES.map((c) => ({ ...c, key: strip(c.name) })), []);
  const matchingCountries = useMemo(() => {
    const q = strip(countryQuery);
    if (!q) return [];
    // Primero los que empiezan por lo escrito, luego los que lo contienen.
    const starts = indexed.filter((c) => c.key.startsWith(q));
    const has = indexed.filter((c) => !c.key.startsWith(q) && c.key.includes(q));
    return [...starts, ...has].slice(0, 6);
  }, [countryQuery, indexed]);

  const countryName = (cc: string) => COUNTRIES.find((c) => c.cc === cc)?.name ?? cc;

  const pending = avail
    ? [!avail.medium && 'medio', !avail.diet && 'alimentación', !avail.repro && 'reproducción', !avail.envs && 'ambientes'].filter(Boolean)
    : [];
  const missingEnvs = avail ? ENVS.filter((e) => (avail.envBits & e.bit) === 0).map((e) => e.label.toLowerCase()) : [];

  const resultLabel =
    count === null ? 'Ver resultados' : count === 0 ? 'Ninguna especie coincide' : `Ver ${fmtInt(count)} ${count === 1 ? 'especie' : 'especies'}`;

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      {/* Cabecera fija */}
      <View style={[styles.head, { paddingTop: insets.top + space.sm, backgroundColor: palette.surface, borderBottomColor: palette.line }]}>
        <Press onPress={() => router.back()} accessibilityLabel="Cerrar filtros" style={styles.headBtn}>
          <Icon name="close" size={24} />
        </Press>
        <View style={styles.headTitle}>
          <Txt variant="heading" accessibilityRole="header">
            Filtros
          </Txt>
          {active > 0 ? (
            <Txt variant="small" tone="faint">
              {active === 1 ? '1 ajuste activo' : `${active} ajustes activos`}
            </Txt>
          ) : null}
        </View>
        <Press
          onPress={() => {
            reset();
            setSort('album');
            setCountryQuery('');
          }}
          disabled={active === 0}
          accessibilityLabel="Limpiar todos los filtros"
          style={styles.clear}>
          <Txt variant="bodyStrong" tone="brand">
            Limpiar
          </Txt>
        </Press>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        showsVerticalScrollIndicator>
        <FilterSection title="Ordenar por" icon="sort" color={palette.ink} tint={palette.strongTint}>
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} icon={s.icon} selected={sort === s.key} onPress={() => setSort(s.key)} />
          ))}
        </FilterSection>

        <FilterSection
          title="Grupo animal"
          icon="bestiario"
          color={palette.brandInk}
          tint={palette.brandTint}
          active={filters.groups.length}
          onClear={() => set({ groups: [] })}>
          {GROUPS.map((g) => (
            <Chip
              key={g.code}
              label={g.label}
              icon={g.code}
              color={groupColors[g.code]}
              count={totals[g.code] !== undefined ? fmtInt(totals[g.code]) : undefined}
              selected={filters.groups.includes(g.code)}
              onPress={() => set({ groups: toggleIn(filters.groups, g.code) })}
            />
          ))}
        </FilterSection>

        <FilterSection
          title="Mi álbum"
          icon="cuaderno"
          color={palette.leaf}
          tint={palette.leafTint}
          active={(filters.caught !== 'any' ? 1 : 0) + (filters.saved ? 1 : 0)}
          onClear={() => set({ caught: 'any', saved: false })}>
          <Chip label="Todas" selected={filters.caught === 'any'} onPress={() => set({ caught: 'any' })} />
          <Chip label="Avistadas" icon="check" selected={filters.caught === 'caught'} onPress={() => set({ caught: 'caught' })} />
          <Chip label="Por avistar" icon="eye" selected={filters.caught === 'missing'} onPress={() => set({ caught: 'missing' })} />
          <Chip label="Guardadas en el Atlas" icon="bookmark" selected={filters.saved} onPress={() => set({ saved: !filters.saved })} />
        </FilterSection>

        <FilterSection
          title="Rareza"
          icon="star"
          color={palette.onSun}
          tint={palette.sunTint}
          active={filters.rarity.length}
          onClear={() => set({ rarity: [] })}>
          {RARITY.map((r) => (
            <Chip
              key={r.tier}
              label={r.label}
              selected={filters.rarity.includes(r.tier)}
              onPress={() => set({ rarity: toggleIn(filters.rarity, r.tier) })}
              leading={<TrailMark tier={r.tier} width={18} />}
            />
          ))}
        </FilterSection>

        <FilterSection
          title="Amenaza"
          note="Categorías de la Lista Roja de la UICN."
          icon="warning"
          color={palette.red}
          tint={palette.redTint}
          active={filters.iucn.length}
          onClear={() => set({ iucn: [] })}>
          {['CR', 'EN', 'VU', 'NT', 'LC', 'DD'].map((c) => (
            <Chip
              key={c}
              label={IUCN_LABEL[c]}
              selected={filters.iucn.includes(c)}
              onPress={() => set({ iucn: toggleIn(filters.iucn, c) })}
              leading={<View style={[styles.dot, { backgroundColor: iucnColors[c].bg, borderColor: palette.lineStrong }]} />}
            />
          ))}
        </FilterSection>

        <FilterSection
          title="Dónde se puede ver"
          note="Una especie cuenta en un país si hay al menos 3 observaciones humanas allí en GBIF."
          icon="globe"
          color={palette.sky}
          tint={palette.skyTint}
          active={filters.countries.length}
          onClear={() => set({ countries: [] })}>
          <View style={styles.full}>
            <View style={styles.wrapRow}>
              {(Object.keys(REGION_LABEL) as Region[]).map((r) => {
                const ccs = regionCountries.get(r) ?? [];
                const on = ccs.length > 0 && ccs.every((cc) => filters.countries.includes(cc));
                return (
                  <Chip
                    key={r}
                    label={REGION_LABEL[r]}
                    selected={on}
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

            <View style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.lineStrong }]}>
              <Icon name="search" size={20} color={palette.inkFaint} />
              <TextInput
                value={countryQuery}
                onChangeText={setCountryQuery}
                placeholder="Escribe un país: España, Kenia…"
                placeholderTextColor={palette.inkFaint}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Buscar un país"
                style={[type.body, styles.input, { color: palette.ink }]}
              />
              {countryQuery ? (
                <Press onPress={() => setCountryQuery('')} accessibilityLabel="Borrar búsqueda" style={styles.clearInput}>
                  <Icon name="close" size={18} color={palette.inkSoft} />
                </Press>
              ) : null}
            </View>

            {countryQuery.trim() ? (
              matchingCountries.length > 0 ? (
                <View style={[styles.results, { backgroundColor: palette.surface, borderColor: palette.line }]}>
                  {matchingCountries.map((c, i) => {
                    const on = filters.countries.includes(c.cc);
                    return (
                      <Press
                        key={c.cc}
                        onPress={() => set({ countries: toggleIn(filters.countries, c.cc) })}
                        scaleTo={1}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={[styles.resultRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line }]}>
                        <View style={[styles.check, on ? { backgroundColor: palette.sky, borderColor: palette.sky } : { borderColor: palette.lineStrong }]}>
                          {on ? <Icon name="check" size={14} color={palette.onStrong} strokeWidth={2.6} /> : null}
                        </View>
                        <Txt variant="body" style={styles.fill} numberOfLines={1}>
                          {c.name}
                        </Txt>
                        <Txt variant="small" tone="faint">
                          {c.region ? REGION_LABEL[c.region] : ''}
                        </Txt>
                      </Press>
                    );
                  })}
                </View>
              ) : (
                <Txt variant="small" tone="soft">
                  Ningún país se llama así. Prueba con otra parte del nombre.
                </Txt>
              )
            ) : null}

            {filters.countries.length > 0 ? (
              <View style={styles.wrapRow}>
                {filters.countries.map((cc) => (
                  <Chip
                    key={cc}
                    label={countryName(cc)}
                    icon="close"
                    selected
                    accessibilityLabel={`Quitar ${countryName(cc)}`}
                    onPress={() => set({ countries: toggleIn(filters.countries, cc) })}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </FilterSection>

        {avail && avail.domestic > 0 && (
          <FilterSection
            title="Doméstico o silvestre"
            note="Doméstico: el perro, la vaca… y también las especies silvestres que tienen forma doméstica (el jabalí y el cerdo), según los catálogos oficiales de razas."
            icon="heart"
            color={palette.red}
            tint={palette.redTint}
            active={filters.domestic !== 'any' ? 1 : 0}
            onClear={() => set({ domestic: 'any' })}>
            <Chip label="Todos" selected={filters.domestic === 'any'} onPress={() => set({ domestic: 'any' })} />
            <Chip label="Domésticos" selected={filters.domestic === 'domestic'} onPress={() => set({ domestic: 'domestic' })} />
            <Chip label="Silvestres" selected={filters.domestic === 'wild'} onPress={() => set({ domestic: 'wild' })} />
          </FilterSection>
        )}

        {avail && avail.envs > 0 && (
          <FilterSection
            title="Ambiente"
            note={`Con ambiente verificado: ${fmtInt(avail.envs)} especies (hábitat de AVONET para aves y de ReptTraits para reptiles; granja, por los catálogos oficiales de ganado).${
              missingEnvs.length ? ` Aún sin fuente que lo verifique: ${missingEnvs.join(', ')}.` : ''
            }`}
            icon="tree"
            color={palette.leaf}
            tint={palette.leafTint}
            active={ENVS.filter((e) => (filters.envs & e.bit) !== 0).length}
            onClear={() => set({ envs: 0 })}>
            {ENVS.filter((e) => (avail.envBits & e.bit) !== 0).map((e) => (
              <Chip key={e.bit} label={e.label} selected={(filters.envs & e.bit) !== 0} onPress={() => set({ envs: filters.envs ^ e.bit })} />
            ))}
          </FilterSection>
        )}

        {avail && avail.medium > 0 && (
          <FilterSection
            title="Medio"
            note={`Con medio verificado: ${fmtInt(avail.medium)} especies (WoRMS y bases de rasgos).`}
            icon="wave"
            color={palette.sky}
            tint={palette.skyTint}
            active={MEDIUM.filter((m) => (filters.media & m.bit) !== 0).length}
            onClear={() => set({ media: 0 })}>
            {MEDIUM.map((m) => (
              <Chip key={m.bit} label={m.label} selected={(filters.media & m.bit) !== 0} onPress={() => set({ media: filters.media ^ m.bit })} />
            ))}
          </FilterSection>
        )}

        {avail && avail.diet > 0 && (
          <FilterSection
            title="Alimentación"
            note={`Con dieta verificada: ${fmtInt(avail.diet)} especies de vertebrados terrestres (AVONET, EltonTraits, ReptTraits, AmphiBIO).`}
            icon="leaf"
            color={palette.leaf}
            tint={palette.leafTint}
            active={filters.diets.length}
            onClear={() => set({ diets: [] })}>
            {diets.map((d) => (
              <Chip key={d} label={d} selected={filters.diets.includes(d)} onPress={() => set({ diets: toggleIn(filters.diets, d) })} />
            ))}
          </FilterSection>
        )}

        {avail && avail.repro > 0 && (
          <FilterSection
            title="Reproducción"
            note={`Con reproducción verificada: ${fmtInt(avail.repro)} especies.`}
            icon="egg"
            color={palette.brandInk}
            tint={palette.brandTint}
            active={filters.repro.length}
            onClear={() => set({ repro: [] })}>
            {repros.map((d) => (
              <Chip key={d} label={d} selected={filters.repro.includes(d)} onPress={() => set({ repro: toggleIn(filters.repro, d) })} />
            ))}
          </FilterSection>
        )}

        {pending.length > 0 && (
          <View style={[styles.pending, { borderColor: palette.lineStrong }]}>
            <Txt variant="label">En verificación</Txt>
            <Txt variant="small" tone="soft">
              Los filtros de {pending.join(', ')} aparecerán cuando esos datos estén contrastados en fuentes oficiales. No se rellenan con
              suposiciones.
            </Txt>
          </View>
        )}
      </ScrollView>

      {/* Pie fijo: el botón de resultados siempre a mano */}
      <View
        style={[
          styles.foot,
          elevation.raised,
          { paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: palette.surface, borderTopColor: palette.line },
        ]}>
        <Press
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel={resultLabel}
          style={[styles.cta, { backgroundColor: count === 0 ? palette.surfaceAlt : palette.brand }]}>
          <Txt variant="subheading" tone={count === 0 ? 'soft' : 'onBrand'}>
            {resultLabel}
          </Txt>
        </Press>
      </View>
    </View>
  );
}

function FilterSection({
  title,
  icon,
  color,
  tint,
  active = 0,
  onClear,
  note,
  children,
}: {
  title: string;
  icon: IconName;
  color: string;
  tint: string;
  active?: number;
  onClear?: () => void;
  note?: string;
  children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.badge, { backgroundColor: tint }]}>
          <Icon name={icon} size={18} color={color} />
        </View>
        <Txt variant="subheading" style={styles.fill} accessibilityRole="header">
          {title}
        </Txt>
        {active > 0 && onClear ? (
          <Press onPress={onClear} accessibilityLabel={`Quitar los ajustes de ${title}`} style={[styles.sectionClear, { backgroundColor: palette.strongTint }]}>
            <Txt variant="label">{active} · Quitar</Txt>
          </Press>
        ) : null}
      </View>
      <View style={styles.wrapRow}>{children}</View>
      {note ? (
        <Txt variant="small" tone="faint">
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  full: { width: '100%', gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  headBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1 },
  clear: { minHeight: 48, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.xl },
  section: { gap: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 36 },
  badge: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionClear: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingLeft: space.md, borderRadius: radius.md, borderWidth: 1.5 },
  input: { flex: 1, paddingVertical: 0, minHeight: 48 },
  clearInput: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  results: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingHorizontal: space.md },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pending: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  foot: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
