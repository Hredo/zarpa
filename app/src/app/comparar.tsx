import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { GroupPill } from '@/components/GroupPill';
import { Icon } from '@/components/Icon';
import { IucnBadge } from '@/components/IucnBadge';
import { Meter } from '@/components/Meter';
import { FadeImage } from '@/components/motion/FadeImage';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import {
  getCountries,
  getSize,
  getSpecies,
  journalContext,
  listSpecies,
  type CountryPresence,
  type SizeInfo,
  type SpeciesDetail,
  type SpeciesRow,
} from '@/db/catalog';
import { COUNTRY_MIN_OBS, EMPTY_FILTERS } from '@/db/query';
import { higher, maskLabels, splitSets, summarizeList } from '@/lib/compare';
import { COUNTRY_NAME } from '@/lib/countries';
import { fmtInt } from '@/lib/format';
import { ENVS, IUCN_LABEL, MEDIUM, rarityInfo } from '@/lib/groups';
import { formatLength, formatMass } from '@/lib/sizeScale';
import { displayName } from '@/lib/speciesName';
import { expandUrl } from '@/lib/urls';
import { groupColor, radius, space, type as typeScale, usePalette } from '@/theme';

type Loaded = { sp: SpeciesDetail; countries: CountryPresence[]; size: SizeInfo | null };

async function load(id: number): Promise<Loaded | null> {
  const sp = await getSpecies(id);
  if (!sp) return null;
  const [countries, size] = await Promise.all([getCountries(id), getSize(id)]);
  return { sp, countries: countries.filter((c) => c.obs >= COUNTRY_MIN_OBS), size };
}

function useLoaded(id: number | null): Loaded | null | undefined {
  const [state, setState] = useState<{ id: number | null; data: Loaded | null } | undefined>(undefined);
  useEffect(() => {
    if (id == null) return;
    let alive = true;
    load(id)
      .then((d) => alive && setState({ id, data: d }))
      .catch(() => alive && setState({ id, data: null }));
    return () => {
      alive = false;
    };
  }, [id]);
  if (id == null) return null;
  return state?.id === id ? state.data : undefined;
}

export default function Comparar() {
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const aId = params.a ? Number(params.a) : null;
  const bId = params.b ? Number(params.b) : null;
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const A = useLoaded(aId);
  const B = useLoaded(bId);
  const colW = (width - space.lg * 2 - space.md) / 2;

  const choose = (side: 'a' | 'b', id: number) => router.setParams({ [side]: String(id) });

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.lg }}>
        <View style={styles.top}>
          <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
            <Icon name="back" />
          </Press>
          <Txt variant="title" accessibilityRole="header" style={styles.flex}>
            Comparar
          </Txt>
        </View>

        <View style={styles.slots}>
          <Slot data={A} width={colW} onPick={(id) => choose('a', id)} exclude={bId} label="Primera especie" />
          <Slot data={B} width={colW} onPick={(id) => choose('b', id)} exclude={aId} label="Segunda especie" />
        </View>

        {A && B ? <Table a={A} b={B} /> : null}
      </ScrollView>
    </View>
  );
}

/** Foto, nombre y grupo de una de las dos especies; sin especie, el buscador para elegirla. */
function Slot({
  data,
  width,
  onPick,
  exclude,
  label,
}: {
  data: Loaded | null | undefined;
  width: number;
  onPick: (id: number) => void;
  exclude: number | null;
  label: string;
}) {
  const palette = usePalette();
  const [searching, setSearching] = useState(false);

  if (data === undefined) {
    return (
      <View style={[styles.slot, { width, height: width * 1.25 }, styles.center]}>
        <ActivityIndicator color={palette.brand} accessibilityLabel="Cargando" />
      </View>
    );
  }
  if (data === null || searching) {
    return <Picker width={width} label={label} exclude={exclude} onPick={(id) => { setSearching(false); onPick(id); }} onCancel={data ? () => setSearching(false) : undefined} />;
  }
  const { sp } = data;
  const dn = displayName(sp);
  const g = groupColor(sp.grp);
  return (
    <Card padding="sm" style={{ width }} onPress={() => router.push({ pathname: '/especie/[id]', params: { id: String(sp.id) } })} accessibilityLabel={`Abrir la ficha de ${dn.name}`}>
      <FadeImage source={expandUrl(sp.img)} style={[styles.photo, { width: width - space.sm * 2, height: (width - space.sm * 2) * 0.9 }]} contentFit="cover" placeholderColor={g.tint} />
      <View style={styles.slotBody}>
        <Txt variant="subheading" numberOfLines={2} style={dn.isSci ? { fontStyle: 'italic' } : undefined}>
          {dn.name}
        </Txt>
        {!dn.isSci ? (
          <Txt variant="sci" tone="soft" numberOfLines={1}>
            {sp.sci}
          </Txt>
        ) : null}
        <Press onPress={() => setSearching(true)} accessibilityRole="button" accessibilityLabel={`Cambiar ${label.toLowerCase()}`} style={styles.change}>
          <Txt variant="label" color={g.ink}>
            Cambiar
          </Txt>
        </Press>
      </View>
    </Card>
  );
}

function Picker({
  width,
  label,
  exclude,
  onPick,
  onCancel,
}: {
  width: number;
  label: string;
  exclude: number | null;
  onPick: (id: number) => void;
  onCancel?: () => void;
}) {
  const palette = usePalette();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<SpeciesRow[]>([]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        if (alive) setRows([]);
        return;
      }
      try {
        const ctx = await journalContext();
        const list = await listSpecies({ ...EMPTY_FILTERS, q }, ctx, 'popular', 8, 0);
        if (alive) setRows(list.filter((r) => r.id !== exclude));
      } catch {
        if (alive) setRows([]);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, exclude]);

  return (
    <View style={[styles.picker, { width, borderColor: palette.lineStrong, backgroundColor: palette.surface }]}>
      <Txt variant="bodyStrong">{label}</Txt>
      <View style={[styles.search, { backgroundColor: palette.surfaceAlt }]}>
        <Icon name="search" size={20} color={palette.inkSoft} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Busca un animal"
          placeholderTextColor={palette.inkFaint}
          style={[typeScale.body, styles.input, { color: palette.ink }]}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={`Buscar la ${label.toLowerCase()}`}
        />
      </View>
      {rows.map((r) => {
        const dn = displayName(r);
        return (
          <Press key={r.id} onPress={() => onPick(r.id)} accessibilityRole="button" style={[styles.result, { borderBottomColor: palette.line }]}>
            <Txt variant="bodyStrong" numberOfLines={1} style={dn.isSci ? { fontStyle: 'italic' } : undefined}>
              {dn.name}
            </Txt>
            {!dn.isSci ? (
              <Txt variant="small" tone="soft" numberOfLines={1}>
                {r.sci}
              </Txt>
            ) : null}
          </Press>
        );
      })}
      {onCancel ? (
        <Press onPress={onCancel} style={styles.change}>
          <Txt variant="label" tone="soft">
            Cancelar
          </Txt>
        </Press>
      ) : null}
    </View>
  );
}

function Pair({ title, a, b }: { title: string; a: React.ReactNode; b: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View style={[styles.pair, { borderBottomColor: palette.line }]}>
      <Txt variant="label" tone="soft">
        {title}
      </Txt>
      <View style={styles.cols}>
        <View style={styles.col}>{a}</View>
        <View style={styles.col}>{b}</View>
      </View>
    </View>
  );
}

const sizeText = (s: SizeInfo | null) => {
  const parts: string[] = [];
  if (s?.length_mm != null) parts.push(`Hasta ${formatLength(s.length_mm)}`);
  if (s?.mass_g != null) parts.push(`Unos ${formatMass(s.mass_g)}`);
  return parts.length ? parts.join(' · ') : null;
};

function Table({ a, b }: { a: Loaded; b: Loaded }) {
  const palette = usePalette();
  const ga = groupColor(a.sp.grp);
  const gb = groupColor(b.sp.grp);
  const maxObs = Math.max(a.sp.rg_obs, b.sp.rg_obs, 1);
  const relObs = (n: number) => Math.log10(n + 1) / Math.log10(maxObs + 1);
  const obsWin = higher(a.sp.rg_obs, b.sp.rg_obs);
  const sa = sizeText(a.size);
  const sb = sizeText(b.size);
  const showSize = !!(sa || sb);

  const split = useMemo(
    () =>
      splitSets(
        a.countries.map((c) => c.cc),
        b.countries.map((c) => c.cc),
      ),
    [a.countries, b.countries],
  );
  const name = (cc: string) => COUNTRY_NAME[cc] ?? cc;
  const envA = maskLabels(a.sp.envs, ENVS);
  const envB = maskLabels(b.sp.envs, ENVS);
  const envSplit = splitSets(envA, envB);
  const mediumA = maskLabels(a.sp.medium, MEDIUM);
  const mediumB = maskLabels(b.sp.medium, MEDIUM);
  const dash = (
    <Txt variant="body" tone="faint">
      Sin dato
    </Txt>
  );
  const text = (t: string | null | undefined) => (t ? <Txt variant="body">{t}</Txt> : dash);

  return (
    <View>
      <Section title="Cara a cara" icon="layers" accent={palette.ink} tint={palette.surfaceAlt}>
        <Pair
          title="Grupo"
          a={<GroupPill code={a.sp.grp} />}
          b={<GroupPill code={b.sp.grp} />}
        />
        <Pair
          title="Lista Roja (UICN)"
          a={a.sp.iucn ? <IucnBadge code={a.sp.iucn} compact /> : dash}
          b={b.sp.iucn ? <IucnBadge code={b.sp.iucn} compact /> : dash}
        />
        {a.sp.iucn || b.sp.iucn ? (
          <View style={styles.cols}>
            <Txt variant="small" tone="soft" style={styles.col}>
              {a.sp.iucn ? IUCN_LABEL[a.sp.iucn] : ''}
            </Txt>
            <Txt variant="small" tone="soft" style={styles.col}>
              {b.sp.iucn ? IUCN_LABEL[b.sp.iucn] : ''}
            </Txt>
          </View>
        ) : null}
        <Pair
          title="Rareza"
          a={<Meter value={a.sp.rarity / 5} color={ga.color} height={10} valueLabel={rarityInfo(a.sp.rarity).label} />}
          b={<Meter value={b.sp.rarity / 5} color={gb.color} height={10} valueLabel={rarityInfo(b.sp.rarity).label} />}
        />
        <Pair
          title="Avistamientos confirmados"
          a={
            <>
              <Txt variant="stat" color={obsWin === 'a' ? ga.ink : palette.ink}>
                {fmtInt(a.sp.rg_obs)}
              </Txt>
              <Meter value={relObs(a.sp.rg_obs)} color={ga.color} height={8} />
            </>
          }
          b={
            <>
              <Txt variant="stat" color={obsWin === 'b' ? gb.ink : palette.ink}>
                {fmtInt(b.sp.rg_obs)}
              </Txt>
              <Meter value={relObs(b.sp.rg_obs)} color={gb.color} height={8} />
            </>
          }
        />
        <Txt variant="small" tone="faint" style={styles.note}>
          Barras en escala logarítmica: cada tramo es diez veces más.
        </Txt>
        <Pair title="Dieta" a={text(a.sp.diet)} b={text(b.sp.diet)} />
        <Pair title="Medio" a={text(mediumA.join(', '))} b={text(mediumB.join(', '))} />
        <Pair title="Ambientes" a={text(envA.join(', '))} b={text(envB.join(', '))} />
        {showSize ? <Pair title="Tamaño" a={text(sa)} b={text(sb)} /> : null}
      </Section>

      {envA.length > 0 && envB.length > 0 ? (
        <Txt variant="body" tone="soft" style={styles.note}>
          {envSplit.both.length > 0 ? `Ambientes en común: ${envSplit.both.join(', ')}.` : 'No comparten ningún ambiente.'}
        </Txt>
      ) : null}

      <Section title="Países" icon="globe" accent={palette.sky} tint={palette.skyTint}>
        <Txt variant="small" tone="soft" style={styles.note}>
          Países con al menos {COUNTRY_MIN_OBS} observaciones registradas en GBIF.
        </Txt>
        <Card tone="tint" tint={palette.skyTint} style={styles.countryCard}>
          <Txt variant="subheading">En común ({split.both.length})</Txt>
          <Txt variant="body">{split.both.length ? summarizeList(split.both.map(name), 14) : 'Ninguno'}</Txt>
        </Card>
        <Card tone="outline" style={styles.countryCard}>
          <Txt variant="subheading" color={ga.ink}>
            Solo {displayName(a.sp).name} ({split.onlyA.length})
          </Txt>
          <Txt variant="body">{split.onlyA.length ? summarizeList(split.onlyA.map(name), 14) : 'Ninguno'}</Txt>
        </Card>
        <Card tone="outline" style={styles.countryCard}>
          <Txt variant="subheading" color={gb.ink}>
            Solo {displayName(b.sp).name} ({split.onlyB.length})
          </Txt>
          <Txt variant="body">{split.onlyB.length ? summarizeList(split.onlyB.map(name), 14) : 'Ninguno'}</Txt>
        </Card>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  slots: { flexDirection: 'row', gap: space.md, marginTop: space.lg, alignItems: 'flex-start' },
  slot: {},
  photo: { borderRadius: radius.md },
  slotBody: { paddingHorizontal: space.xs, paddingTop: space.sm, gap: 2 },
  change: { minHeight: 44, justifyContent: 'center' },
  picker: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.md, gap: space.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.pill },
  input: { flex: 1, paddingVertical: 0 },
  result: { minHeight: 48, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  pair: { paddingVertical: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  cols: { flexDirection: 'row', gap: space.md },
  col: { flex: 1, gap: space.xs },
  note: { marginTop: space.sm },
  countryCard: { marginTop: space.md, gap: space.xs },
});
