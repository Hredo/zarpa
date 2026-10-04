import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreedLine } from '@/components/BreedLine';
import { Icon } from '@/components/Icon';
import { IucnBadge } from '@/components/IucnBadge';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { TaxonLadder } from '@/components/TaxonLadder';
import { TrailMark } from '@/components/TrailMark';
import { Txt } from '@/components/Txt';
import {
  breedTotals,
  getCities,
  getCountries,
  getImages,
  listBreeds,
  type Authority,
  type BreedRow,
  type City,
  getProvenance,
  getSources,
  getSpecies,
  type CountryPresence,
  type Provenance,
  type Source,
  type SpeciesDetail,
  type SpeciesImage,
} from '@/db/catalog';
import { COUNTRY_MIN_OBS } from '@/db/query';
import { COUNTRY_NAME } from '@/lib/countries';
import { fmtAgo, fmtDate, fmtInt } from '@/lib/format';
import { AUTHORITY_LABEL, DIETS, DOMESTIC_LABEL, ENVS, GROUP_BY_CODE, IUCN_LABEL, MEANS_LABEL, MEDIUM, rarityInfo } from '@/lib/groups';
import { useLastLocation, useUserCountry } from '@/lib/location';
import { expandUrl } from '@/lib/urls';
import { seasonality, similarSpecies, type Fetched, type Histogram, type Similar } from '@/lib/remote';
import { sightingsOf, useJournal, type Sighting } from '@/store/journal';
import { radius, space, usePalette } from '@/theme';

const MONTHS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const FIELD_LABEL: Record<string, string> = {
  taxonomy: 'Clasificación',
  observations: 'Observaciones confirmadas',
  name_es: 'Nombre en español',
  iucn: 'Categoría de amenaza (UICN)',
  summary: 'Descripción',
  medium: 'Medio',
  diet: 'Alimentación',
  repro: 'Reproducción',
  domestic: 'Doméstica',
  envs: 'Ambientes',
  diet_detail: 'Dieta en detalle',
  activity: 'Actividad',
  migration: 'Migración',
};

/** Válidas para todas las especies del catálogo (build.py no las repite en cada una). */
const BASE_PROVENANCE: Provenance[] = [
  { field: 'taxonomy', sources: 'inat,gbif', note: null },
  { field: 'observations', sources: 'inat', note: null },
];

export default function Ficha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const speciesId = Number(id);
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const near = useLastLocation();
  const userCc = useUserCountry();

  const [sp, setSp] = useState<SpeciesDetail | null | undefined>(undefined);
  const [images, setImages] = useState<SpeciesImage[]>([]);
  const [prov, setProv] = useState<Provenance[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [countries, setCountries] = useState<CountryPresence[]>([]);
  const [mine, setMine] = useState<Sighting[]>([]);
  const [similar, setSimilar] = useState<Fetched<Similar[]> | null | undefined>(undefined);
  const [season, setSeason] = useState<Fetched<Histogram> | null | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [allCountries, setAllCountries] = useState(false);
  const [breedCount, setBreedCount] = useState<Partial<Record<Authority, number>>>({});
  const [breedPreview, setBreedPreview] = useState<{ cc: string | null; rows: BreedRow[] }>({ cc: null, rows: [] });
  const [cities, setCities] = useState<City[]>([]);

  const saved = useJournal((s) => s.saved.has(speciesId));
  const caughtCount = useJournal((s) => s.caught.get(speciesId) ?? 0);
  const toggleSaved = useJournal((s) => s.toggleSaved);
  const touchRecent = useJournal((s) => s.touchRecent);

  useEffect(() => {
    getSpecies(speciesId).then((d) => {
      setSp(d);
      const ids = d?.cities ? (JSON.parse(d.cities) as [number, number][]).map(([cid]) => cid) : [];
      getCities(ids).then(setCities);
    });
    getImages(speciesId).then(setImages);
    getProvenance(speciesId).then(setProv);
    getSources().then(setSources);
    getCountries(speciesId).then(setCountries);
    touchRecent(speciesId).catch(() => {});
    similarSpecies(speciesId).then(setSimilar);
    breedTotals(speciesId).then(setBreedCount);
  }, [speciesId, touchRecent]);

  // Avance de razas: primero las del país del usuario, si las hay.
  useEffect(() => {
    let alive = true;
    (async () => {
      const local = userCc ? await listBreeds(speciesId, { cc: userCc }, 6, 0) : [];
      const rows = local.length ? local : await listBreeds(speciesId, {}, 6, 0);
      if (alive) setBreedPreview({ cc: local.length ? userCc : null, rows });
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [speciesId, userCc]);

  useEffect(() => {
    sightingsOf(speciesId).then(setMine);
  }, [speciesId, caughtCount]);

  useEffect(() => {
    seasonality(speciesId, near ?? undefined).then(setSeason);
  }, [speciesId, near]);

  const heroH = Math.round(width * 0.82);
  const name = sp ? (sp.name_es ?? sp.name_en ?? sp.sci) : '';
  const group = sp ? GROUP_BY_CODE[sp.grp] : null;
  const rarity = sp ? rarityInfo(sp.rarity) : null;
  const visibleCountries = countries.filter((c) => c.obs >= COUNTRY_MIN_OBS);
  const shownCountries = allCountries ? visibleCountries : visibleCountries.slice(0, 8);
  const maxObs = visibleCountries[0]?.obs ?? 1;

  const sourceByCode = useMemo(() => Object.fromEntries(sources.map((s) => [s.code, s])), [sources]);

  if (sp === undefined) return <View style={[styles.fill, { backgroundColor: palette.bg }]} />;
  if (sp === null) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: palette.bg, paddingTop: insets.top }]}>
        <Txt variant="heading">Esta especie no está en el catálogo</Txt>
        <Press onPress={() => router.back()} style={styles.textBtn}>
          <Txt variant="bodyStrong">Volver</Txt>
        </Press>
      </View>
    );
  }

  const rungs = [
    { rank: 'kingdom', sci: 'Animalia', es: 'Animales' },
    { rank: 'class', sci: sp.class_sci, es: sp.class_es },
    { rank: 'order', sci: sp.order_sci, es: sp.order_es },
    { rank: 'family', sci: sp.family_sci, es: sp.family_es },
    { rank: 'genus', sci: sp.genus_sci, es: null },
    { rank: 'species', sci: sp.sci, es: sp.name_es },
  ].filter((r) => r.sci);

  const fill = (template: string | null) =>
    template
      ?.replace('{id}', String(sp.id))
      .replace('{gbif}', String(sp.gbif ?? ''))
      .replace('{wd}', sp.wd ?? '')
      .replace('{worms}', String(sp.worms ?? ''))
      .replace('{eswiki}', encodeURIComponent(sp.eswiki ?? ''))
      .replace('{enwiki}', encodeURIComponent(sp.enwiki ?? ''))
      .replace('{sci}', encodeURIComponent(sp.sci)) ?? null;

  const media = MEDIUM.filter((m) => (sp.medium & m.bit) !== 0).map((m) => m.label);
  const envs = ENVS.filter((e) => (sp.envs & e.bit) !== 0).map((e) => e.label);
  const dietHint = DIETS.find((d) => d.label === sp.diet)?.hint;
  const breedTotal = Object.values(breedCount).reduce((a, b) => a + (b ?? 0), 0);
  const peak = season?.data && season.data.total > 0 ? peakMonths(season.data.months) : null;

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}>
        {/* Galería: imágenes con licencia libre y su autor debajo, nunca encima. */}
        <View style={{ height: heroH, backgroundColor: palette.forest }}>
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
              {images.map((im) => (
                <Image
                  key={im.rank}
                  source={expandUrl(im.url)}
                  style={{ width, height: heroH }}
                  contentFit="cover"
                  transition={200}
                  accessibilityLabel={`Fotografía de ${name}`}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.fill, styles.center]}>
              <Icon name={sp.grp} size={96} color={palette.onForestSoft} strokeWidth={1.2} />
              <Txt variant="small" tone="onForestSoft" style={{ marginTop: space.md }}>
                Aún no hay una foto con licencia libre de esta especie
              </Txt>
            </View>
          )}
          <View style={[styles.topBar, { top: insets.top + space.sm }]}>
            <RoundBtn icon="back" label="Volver" onPress={() => router.back()} />
            <RoundBtn
              icon={saved ? 'bookmarkFilled' : 'bookmark'}
              label={saved ? 'Quitar del Atlas' : 'Guardar en el Atlas'}
              onPress={() => toggleSaved(sp.id)}
            />
          </View>
          {images.length > 1 && (
            <View style={styles.dots}>
              {images.map((im, i) => (
                <View key={im.rank} style={[styles.dot, { backgroundColor: i === page ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }]} />
              ))}
            </View>
          )}
        </View>
        {images[page] && (
          <Press
            onPress={() => images[page].page && WebBrowser.openBrowserAsync(expandUrl(images[page].page)!)}
            style={[styles.credit, { borderBottomColor: palette.line }]}>
            <Txt variant="small" tone="faint" numberOfLines={2}>
              Foto: {images[page].author ?? 'autor sin indicar'} · {images[page].license ?? 'licencia libre'} ·{' '}
              {images[page].source === 'commons' ? 'Wikimedia Commons' : 'iNaturalist'}
            </Txt>
          </Press>
        )}

        <View style={styles.content}>
          <Txt variant="data" tone="faint">
            Nº {String(sp.seq).padStart(4, '0')} · {group?.label} · {sp.family_sci}
          </Txt>
          <Txt variant={name.length > 22 ? 'title' : 'hero'} style={styles.name}>
            {name}
          </Txt>
          <Txt variant="sci" tone="soft" style={styles.sciLine}>
            {sp.sci}
            {sp.gbif_name ? <Txt variant="small" tone="faint">{`  ·  en GBIF: ${sp.gbif_name}`}</Txt> : null}
          </Txt>
          {sp.name_en && sp.name_en !== name ? (
            <Txt variant="small" tone="faint">
              En inglés: {sp.name_en}
            </Txt>
          ) : null}

          <View style={styles.badges}>
            <View style={styles.rarityRow}>
              <TrailMark tier={sp.rarity} width={30} />
              <View>
                <Txt variant="label">{rarity?.label}</Txt>
                <Txt variant="data" tone="faint">
                  {fmtInt(sp.rg_obs)} avistamientos confirmados
                </Txt>
              </View>
            </View>
            {sp.iucn ? <IucnBadge code={sp.iucn} /> : null}
          </View>

          {/* Tu cromo */}
          <View
            style={[
              styles.mine,
              mine.length
                ? { backgroundColor: palette.surface, borderColor: palette.line }
                : { borderColor: palette.lineStrong, borderStyle: 'dashed' },
            ]}>
            {mine.length ? (
              <>
                <View style={styles.mineRow}>
                  {mine.slice(0, 3).map((s) => (
                    <Press
                      key={s.id}
                      onPress={() => router.push({ pathname: '/avistamiento/[id]', params: { id: s.id } })}
                      accessibilityLabel="Abrir tu avistamiento">
                      <Image source={s.sticker ?? s.photo} style={styles.mineThumb} contentFit="contain" />
                    </Press>
                  ))}
                </View>
                <Txt variant="bodyStrong">
                  {mine.length === 1 ? 'La has avistado una vez' : `La has avistado ${mine.length} veces`}
                </Txt>
                <Txt variant="small" tone="soft">
                  Última, {fmtAgo(mine[0].created_at)} ({fmtDate(mine[0].created_at)})
                  {mine[0].place ? ` en ${mine[0].place}` : ''}
                </Txt>
              </>
            ) : (
              <>
                <Txt variant="bodyStrong">Hueco vacío en tu cuaderno</Txt>
                <Txt variant="small" tone="soft">
                  Cuando la encuentres, apunta con el visor: la IA la reconoce y su pegatina se queda aquí para siempre.
                </Txt>
                <Press
                  haptic
                  onPress={() => router.push('/avistar')}
                  style={[styles.cta, { backgroundColor: palette.blaze, borderColor: palette.ink }]}>
                  <Icon name="avistar" size={22} color={palette.onBlaze} />
                  <Txt variant="bodyStrong" tone="onBlaze">
                    Avistar
                  </Txt>
                </Press>
              </>
            )}
          </View>

          {sp.summary ? (
            <Section title="Quién es">
              <Txt variant="body">{trimSummary(sp.summary)}</Txt>
              <Press
                onPress={() =>
                  WebBrowser.openBrowserAsync(
                    `https://${sp.summary_lang ?? 'es'}.wikipedia.org/wiki/${encodeURIComponent(sp.summary_src ?? '')}`,
                  )
                }
                style={styles.sourceLink}>
                <Icon name="external" size={16} color={palette.inkSoft} />
                <Txt variant="small" tone="soft">
                  Wikipedia {sp.summary_lang === 'en' ? 'en inglés' : 'en español'} · «{sp.summary_src}» · CC BY-SA 4.0
                </Txt>
              </Press>
            </Section>
          ) : null}

          <Section title="Clasificación">
            <TaxonLadder rungs={rungs} />
          </Section>

          {(media.length > 0 || envs.length > 0 || sp.diet || sp.diet_detail || sp.repro || sp.activity || sp.migration || sp.domestic > 0) && (
            <Section title="Cómo vive">
              <View style={styles.facts}>
                {sp.domestic > 0 && <Fact label="Tipo" value={DOMESTIC_LABEL[sp.domestic]} />}
                {media.length > 0 && <Fact label="Medio" value={media.join(' · ')} />}
                {envs.length > 0 && <Fact label="Ambientes" value={envs.join(' · ')} />}
                {sp.diet && <Fact label="Alimentación" value={sp.diet} />}
                {sp.repro && <Fact label="Reproducción" value={sp.repro} />}
                {sp.activity && <Fact label="Actividad" value={sp.activity} />}
                {sp.migration && <Fact label="Migración" value={sp.migration} />}
              </View>
              {cities.length > 0 ? (
                <Txt variant="small" tone="soft" style={{ marginTop: space.md }}>
                  {`Se deja ver en el centro de ${cityList(cities, sp.cities_n ?? cities.length)}: al menos 10 observaciones humanas en GBIF en los 8 × 8 km del casco urbano.`}
                </Txt>
              ) : null}
              {dietHint || sp.diet_detail ? (
                <Txt variant="small" tone="soft" style={{ marginTop: space.md }}>
                  {[dietHint, sp.diet_detail ? `Dieta según EltonTraits: ${sp.diet_detail}.` : null].filter(Boolean).join('. ')}
                </Txt>
              ) : null}
            </Section>
          )}

          {breedTotal > 0 && (
            <Section
              title="Razas"
              aside={
                <Txt variant="data" tone="faint">
                  {fmtInt(breedTotal)} reconocidas
                </Txt>
              }>
              <Txt variant="body" tone="soft" style={{ marginBottom: space.sm }}>
                {breedPreview.cc
                  ? `Algunas de ${COUNTRY_NAME[breedPreview.cc] ?? breedPreview.cc}. `
                  : ''}
                Fuente: {(Object.keys(breedCount) as Authority[]).map((a) => AUTHORITY_LABEL[a]).join(', ')}.
              </Txt>
              {breedPreview.rows.map((b) => (
                <BreedLine key={b.id} breed={b} onPress={(bid) => router.push({ pathname: '/raza/[id]', params: { id: bid } })} />
              ))}
              {breedTotal > breedPreview.rows.length && (
                <Press
                  onPress={() => router.push({ pathname: '/razas/[id]', params: { id: String(sp.id) } })}
                  style={styles.textBtn}>
                  <Txt variant="label">{`Ver las ${fmtInt(breedTotal)} razas`}</Txt>
                </Press>
              )}
            </Section>
          )}

          {season?.data && season.data.total > 0 && (
            <Section title="Cuándo verla">
              <Txt variant="body" tone="soft" style={{ marginBottom: space.md }}>
                {season.data.scope === 'cerca'
                  ? 'Avistamientos confirmados a menos de 300 km de ti, por mes.'
                  : 'Avistamientos confirmados en todo el mundo, por mes.'}
                {peak ? ` Más fácil en ${peak}.` : ''}
              </Txt>
              <Bars values={season.data.months} labels={MONTHS} />
              {season.data.hours.some((h) => h > 0) && (
                <>
                  <Txt variant="small" tone="faint" style={{ marginTop: space.lg, marginBottom: space.sm }}>
                    Por hora del día (hora local de cada observación)
                  </Txt>
                  <Bars values={season.data.hours} labels={season.data.hours.map((_, i) => (i % 6 === 0 ? `${i}h` : ''))} compact />
                </>
              )}
              <Txt variant="small" tone="faint" style={{ marginTop: space.sm }}>
                Fuente: iNaturalist, {fmtInt(season.data.total)} observaciones · consultado {fmtAgo(season.fetchedAt)}
              </Txt>
            </Section>
          )}

          {similar?.data && similar.data.length > 0 && (
            <Section title="Con qué se confunde">
              <Txt variant="body" tone="soft" style={{ marginBottom: space.md }}>
                Especies que la comunidad identificó por error como esta y corrigió después. Si dudas, compáralas.
              </Txt>
              {similar.data.map((s) => (
                <Press
                  key={s.id}
                  onPress={() => router.push({ pathname: '/especie/[id]', params: { id: String(s.id) } })}
                  style={[styles.similar, { borderBottomColor: palette.line }]}>
                  <View style={styles.fill}>
                    <Txt variant="bodyStrong">{s.name ?? s.sci}</Txt>
                    {s.name ? (
                      <Txt variant="sci" tone="soft">
                        {s.sci}
                      </Txt>
                    ) : null}
                  </View>
                  <Txt variant="data" tone="faint">
                    {fmtInt(s.count)} confusiones
                  </Txt>
                  <Icon name="chevronRight" size={18} color={palette.inkFaint} />
                </Press>
              ))}
            </Section>
          )}

          {visibleCountries.length > 0 && (
            <Section
              title="Dónde vive"
              aside={
                <Press
                  onPress={async () => {
                    if (!saved) await toggleSaved(sp.id);
                    router.push({ pathname: '/atlas', params: { focus: String(sp.id) } });
                  }}
                  style={styles.inlineBtn}>
                  <Icon name="atlas" size={18} color={palette.ink} />
                  <Txt variant="label">Ver en el Atlas</Txt>
                </Press>
              }>
              <Txt variant="body" tone="soft" style={{ marginBottom: space.md }}>
                Países con al menos {COUNTRY_MIN_OBS} observaciones humanas registradas en GBIF. Nativa, endémica o
                introducida, según iNaturalist, cuando lo indica.
              </Txt>
              {shownCountries.map((c) => (
                <View key={c.cc} style={styles.countryRow}>
                  <View style={styles.countryName}>
                    <Txt variant="body" numberOfLines={1}>
                      {COUNTRY_NAME[c.cc] ?? c.cc}
                    </Txt>
                    {c.means ? (
                      <Txt variant="data" tone={c.means === 'introduced' ? 'trailRed' : 'faint'}>
                        {MEANS_LABEL[c.means]}
                      </Txt>
                    ) : null}
                  </View>
                  <View style={[styles.barTrack, { backgroundColor: palette.surfaceAlt }]}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.max(2, (Math.log10(c.obs + 1) / Math.log10(maxObs + 1)) * 100)}%`, backgroundColor: palette.forest },
                      ]}
                    />
                  </View>
                  <Txt variant="data" tone="faint" style={styles.countryObs}>
                    {fmtInt(c.obs)}
                  </Txt>
                </View>
              ))}
              {visibleCountries.length > 8 && (
                <Press onPress={() => setAllCountries((v) => !v)} style={styles.textBtn}>
                  <Txt variant="label">{allCountries ? 'Ver menos' : `Ver los ${visibleCountries.length} países`}</Txt>
                </Press>
              )}
            </Section>
          )}

          <Section title="Fuentes">
            <Txt variant="small" tone="soft" style={{ marginBottom: space.md }}>
              Cada dato de esta ficha viene de su autoridad o de dos fuentes que coinciden. Lo que no cumple eso no se
              muestra.
            </Txt>
            {[...BASE_PROVENANCE, ...prov]
              .filter((p) => p.sources)
              .map((p) => (
                <View key={p.field} style={[styles.provRow, { borderBottomColor: palette.line }]}>
                  <Txt variant="label" style={{ width: 132 }}>
                    {FIELD_LABEL[p.field] ?? p.field}
                  </Txt>
                  <View style={styles.provSources}>
                    {p.sources.split(',').map((code) => {
                      const src = sourceByCode[code];
                      const url = fill(src?.url ?? null);
                      return (
                        <Press
                          key={code}
                          disabled={!url}
                          onPress={() => url && WebBrowser.openBrowserAsync(url)}
                          style={styles.provSource}>
                          <Txt variant="small" tone="soft">
                            {src?.label ?? code}
                          </Txt>
                          {url ? <Icon name="external" size={14} color={palette.inkFaint} /> : null}
                        </Press>
                      );
                    })}
                  </View>
                </View>
              ))}
            {sp.iucn ? (
              <Txt variant="small" tone="faint" style={{ marginTop: space.sm }}>
                {IUCN_LABEL[sp.iucn]}: categoría global de la Lista Roja. Las listas nacionales pueden diferir.
              </Txt>
            ) : null}
          </Section>
        </View>
      </ScrollView>
    </View>
  );
}

function cityList(cities: City[], total: number): string {
  const names = cities.slice(0, 4).map((c) => c.name);
  const rest = total - names.length;
  if (rest > 0) return `${names.join(', ')} y ${rest === 1 ? 'otra gran ciudad' : `${rest} grandes ciudades más`}`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];
}

function trimSummary(text: string): string {
  // Primeros dos párrafos: la introducción completa de algunos artículos es
  // larguísima y la ficha enlaza al artículo para quien quiera más.
  return text.split('\n').filter(Boolean).slice(0, 2).join('\n\n');
}

function peakMonths(months: number[]): string | null {
  const total = months.reduce((a, b) => a + b, 0);
  if (total < 20) return null;
  const max = Math.max(...months);
  const top = months.map((v, i) => [v, i] as const).filter(([v]) => v >= max * 0.8).map(([, i]) => MONTHS_LONG[i]);
  if (top.length > 4) return null; // Todo el año por igual: no hay temporada que destacar.
  return top.length === 1 ? top[0] : `${top.slice(0, -1).join(', ')} y ${top[top.length - 1]}`;
}

function Bars({ values, labels, compact }: { values: number[]; labels: string[]; compact?: boolean }) {
  const palette = usePalette();
  const max = Math.max(1, ...values);
  const h = compact ? 44 : 72;
  return (
    <View>
      <View style={[styles.bars, { height: h }]}>
        {values.map((v, i) => (
          <View key={i} style={styles.barCol}>
            <View
              style={{
                height: Math.max(v > 0 ? 3 : 1, (v / max) * h),
                backgroundColor: v > 0 ? palette.forest : palette.line,
                borderTopLeftRadius: 2,
                borderTopRightRadius: 2,
              }}
            />
          </View>
        ))}
      </View>
      <View style={styles.barLabels}>
        {labels.map((l, i) => (
          <Txt key={i} variant="data" tone="faint" style={styles.barLabel}>
            {l}
          </Txt>
        ))}
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return (
    <View style={[styles.fact, { borderColor: palette.line, backgroundColor: palette.surface }]}>
      <Txt variant="data" tone="faint">
        {label}
      </Txt>
      <Txt variant="bodyStrong">{value}</Txt>
    </View>
  );
}

function RoundBtn({ icon, label, onPress }: { icon: 'back' | 'bookmark' | 'bookmarkFilled'; label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityLabel={label} haptic={icon !== 'back'} style={styles.round}>
      <Icon name={icon} size={22} color="#FFFFFF" />
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between' },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(8,14,10,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { position: 'absolute', bottom: space.md, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  credit: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg },
  name: { marginTop: space.xs },
  sciLine: { marginTop: space.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginTop: space.lg },
  rarityRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mine: { marginTop: space.xl, borderWidth: 1.5, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  mineRow: { flexDirection: 'row', gap: space.md, marginBottom: space.sm },
  mineThumb: { width: 76, height: 76 },
  cta: {
    marginTop: space.md,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 48,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  sourceLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fact: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  barCol: { flex: 1, justifyContent: 'flex-end' },
  barLabels: { flexDirection: 'row', gap: 3, marginTop: 4 },
  barLabel: { flex: 1, textAlign: 'center', fontSize: 11 },
  similar: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  inlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.xs },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 36, paddingVertical: 2 },
  countryName: { width: 128 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  countryObs: { width: 72, textAlign: 'right' },
  textBtn: { paddingVertical: space.md },
  provRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  provSources: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  provSource: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
