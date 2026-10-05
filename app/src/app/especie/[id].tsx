import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreedLine } from '@/components/BreedLine';
import { Card } from '@/components/Card';
import { FichaHero, HERO_OVERLAP, PhotoCredit } from '@/components/ficha/FichaHero';
import { CountryList } from '@/components/ficha/CountryList';
import { IucnScale } from '@/components/ficha/IucnScale';
import { LifeStyle } from '@/components/ficha/LifeStyle';
import { ReadMore } from '@/components/ficha/ReadMore';
import { HourBars, MonthBars, peakMonths } from '@/components/ficha/SeasonChart';
import { ShareCromoButton } from '@/components/ficha/ShareCromoButton';
import { SizeCompare } from '@/components/ficha/SizeCompare';
import { SoundSection } from '@/components/ficha/SoundSection';
import { Tag } from '@/components/ficha/Tag';
import { GroupPill } from '@/components/GroupPill';
import { Icon, type IconName } from '@/components/Icon';
import { Meter } from '@/components/Meter';
import { Appear } from '@/components/motion/Appear';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { StatTile } from '@/components/StatTile';
import { TaxonLadder } from '@/components/TaxonLadder';
import { TrailMark } from '@/components/TrailMark';
import { Txt } from '@/components/Txt';
import {
  breedTotals,
  getAtlasSpecies,
  getCities,
  getCountries,
  getImages,
  listBreeds,
  type Authority,
  type BreedRow,
  type City,
  getProvenance,
  getSources,
  getSize,
  getSpecies,
  type CountryPresence,
  type Provenance,
  type SizeInfo,
  type Source,
  type SpeciesDetail,
  type SpeciesImage,
} from '@/db/catalog';
import { COUNTRY_MIN_OBS } from '@/db/query';
import { COUNTRY_NAME } from '@/lib/countries';
import { fmtAgo, fmtDate, fmtInt } from '@/lib/format';
import { AUTHORITY_LABEL, GROUP_BY_CODE, IUCN_LABEL, rarityInfo } from '@/lib/groups';
import { useLastLocation, useUserCountry } from '@/lib/location';
import { kidsFacts } from '@/lib/kids';
import { displayName } from '@/lib/speciesName';
import { SOUND_GROUPS, type Sound } from '@/lib/sounds';
import { speciesSounds } from '@/lib/soundsRemote';
import { MIN_HOUR_SAMPLE, seasonality, similarSpecies, type Fetched, type Histogram, type Similar } from '@/lib/remote';
import { useSettings } from '@/store/settings';
import { sightingsOf, useJournal, type Sighting } from '@/store/journal';
import { fonts, groupColor, radius, space, usePalette } from '@/theme';

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
  const [breedCount, setBreedCount] = useState<Partial<Record<Authority, number>>>({});
  const [breedPreview, setBreedPreview] = useState<{ cc: string | null; rows: BreedRow[] }>({ cc: null, rows: [] });
  const [cities, setCities] = useState<City[]>([]);
  const [similarNames, setSimilarNames] = useState<Record<number, string | null>>({});
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [size, setSize] = useState<SizeInfo | null>(null);
  const kids = useSettings((s) => s.kidsMode);
  const toggleKids = useSettings((s) => s.toggleKidsMode);

  const saved = useJournal((s) => s.saved.has(speciesId));
  const caughtCount = useJournal((s) => s.caught.get(speciesId) ?? 0);
  const toggleSaved = useJournal((s) => s.toggleSaved);
  const touchRecent = useJournal((s) => s.touchRecent);

  useEffect(() => {
    getSpecies(speciesId)
      .then((d) => {
        setSp(d);
        const ids = d?.cities ? (JSON.parse(d.cities) as [number, number][]).map(([cid]) => cid) : [];
        getCities(ids).then(setCities);
      })
      .catch(() => setSp(null));
    getImages(speciesId).then(setImages);
    getProvenance(speciesId).then(setProv);
    getSources().then(setSources);
    getCountries(speciesId).then(setCountries);
    touchRecent(speciesId).catch(() => {});
    similarSpecies(speciesId).then(setSimilar);
    breedTotals(speciesId).then(setBreedCount);
    getSize(speciesId).then(setSize).catch(() => setSize(null));
  }, [speciesId, touchRecent]);

  // Cantos y sonidos (iNaturalist, CC): solo para grupos que suenan; sin sonido no hay sección.
  const grp = sp?.grp;
  useEffect(() => {
    if (!grp || !SOUND_GROUPS.has(grp)) return;
    let alive = true;
    speciesSounds(speciesId)
      .then((r) => {
        if (alive) setSounds(r?.data ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [speciesId, grp]);

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

  // Los nombres de «Con qué se confunde» vienen de iNaturalist y pueden llegar en inglés:
  // se usa solo el nombre en español del catálogo local; si no hay, el científico.
  useEffect(() => {
    const ids = similar?.data?.map((x) => x.id) ?? [];
    if (ids.length === 0) return;
    let alive = true;
    getAtlasSpecies(ids)
      .then((rows) => {
        if (alive) setSimilarNames(Object.fromEntries(rows.map((r) => [r.id, r.name_es])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [similar]);

  useEffect(() => {
    sightingsOf(speciesId).then(setMine);
  }, [speciesId, caughtCount]);

  useEffect(() => {
    seasonality(speciesId, near ?? undefined).then(setSeason);
  }, [speciesId, near]);


  const heroH = Math.round(width * 0.95);
  const g = groupColor(sp?.grp);
  const dn = sp ? displayName(sp) : null;
  const hasEsName = !!sp?.name_es;
  const name = dn?.name ?? '';
  const group = sp ? GROUP_BY_CODE[sp.grp] : null;
  const rarity = sp ? rarityInfo(sp.rarity) : null;
  const visibleCountries = countries.filter((c) => c.obs >= COUNTRY_MIN_OBS);

  const sourceByCode = useMemo(() => Object.fromEntries(sources.map((s) => [s.code, s])), [sources]);

  if (sp === undefined) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.brand} accessibilityLabel="Cargando la ficha" />
      </View>
    );
  }
  if (sp === null) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: palette.bg, paddingTop: insets.top }]}>
        <Txt variant="heading" align="center">Esta especie no está en el catálogo</Txt>
        <Press onPress={() => router.back()} accessibilityRole="button" style={styles.textBtn}>
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

  const aliases = (sp.aliases_es ?? '')
    .split('|')
    .map((a) => a.trim())
    .filter((a) => a && a.toLowerCase() !== (sp.name_es ?? '').toLowerCase())
    .slice(0, 6);
  const breedTotal = Object.values(breedCount).reduce((a, b) => a + (b ?? 0), 0);
  const peak = season?.data && season.data.total > 0 ? peakMonths(season.data.months) : null;
  const paragraphs = sp.summary ? sp.summary.split('\n').filter(Boolean).slice(0, 4) : [];
  const hasLife =
    sp.medium > 0 || sp.envs > 0 || !!sp.diet || !!sp.diet_detail || !!sp.repro || !!sp.activity || !!sp.migration || sp.domestic > 0;
  const freq = Math.min(1, Math.log10(sp.rg_obs + 1) / 6);
  const rarityColor = sp.rarity <= 2 ? palette.leaf : sp.rarity === 3 ? palette.brand : sp.rarity === 4 ? palette.red : palette.strong;
  const hasHours = !!season?.data && season.data.hoursSample >= MIN_HOUR_SAMPLE;

  const sizeCredit =
    [...new Set(prov.filter((p) => (p.field === 'mass_g' || p.field === 'length_mm') && p.sources).flatMap((p) => p.sources.split(',')))]
      .map((c) => sourceByCode[c]?.label ?? c)
      .join(', ') || null;
  const sizeShown = size && (size.mass_g != null || size.length_mm != null) ? size : null;
  const facts = kids
    ? kidsFacts({
        grp: sp.grp,
        singular: group?.singular ?? 'Animal',
        diet: sp.diet,
        medium: sp.medium,
        countries: visibleCountries.length,
        endemic: visibleCountries.filter((c) => c.means === 'endemic').map((c) => COUNTRY_NAME[c.cc] ?? c.cc),
        iucn: sp.iucn,
        rarity: sp.rarity,
        domestic: sp.domestic,
        mass_g: sizeShown?.mass_g,
        length_mm: sizeShown?.length_mm,
      })
    : [];

  // Lo que distingue a la especie, solo de datos verificados del catálogo.
  const endemic = visibleCountries.filter((c) => c.means === 'endemic').map((c) => COUNTRY_NAME[c.cc] ?? c.cc);
  const introduced = visibleCountries.filter((c) => c.means === 'introduced').length;
  const highlights: { icon: IconName; text: string; tone: 'group' | 'red' | 'sun' }[] = [];
  if (endemic.length > 0 && endemic.length <= 3) {
    highlights.push({ icon: 'pin', text: `Endémica de ${endemic.join(' y ')}: no vive de forma natural en ningún otro sitio.`, tone: 'group' });
  }
  if (sp.iucn && ['CR', 'EN', 'VU'].includes(sp.iucn)) {
    highlights.push({ icon: 'warning', text: `Amenazada: ${IUCN_LABEL[sp.iucn].toLowerCase()} según la Lista Roja.`, tone: 'red' });
  }
  if (sp.iucn === 'EX' || sp.iucn === 'EW') {
    highlights.push({
      icon: 'hourglass',
      text: sp.iucn === 'EX' ? 'Extinta: ya no queda ninguna.' : 'Extinta en estado silvestre: solo sobrevive al cuidado humano.',
      tone: 'red',
    });
  }
  if (introduced > 0) {
    highlights.push({ icon: 'globe', text: `Introducida por las personas en ${introduced === 1 ? 'un país' : `${introduced} países`}.`, tone: 'red' });
  }
  if (sp.cities_n && sp.cities_n > 0 && cities.length > 0) {
    highlights.push({ icon: 'pin', text: `Se deja ver en el centro de ${cityList(cities, sp.cities_n)}.`, tone: 'group' });
  }
  if (sp.rarity >= 5) {
    highlights.push({ icon: 'sparkle', text: 'Rareza legendaria: encontrarla es de lo más difícil del álbum.', tone: 'sun' });
  }

  let n = 1;
  const ix = () => n++;

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}>
        <FichaHero
          images={images}
          name={name}
          grp={sp.grp}
          width={width}
          height={heroH}
          top={insets.top + space.sm}
          saved={saved}
          onBack={() => router.back()}
          onToggleSaved={() => toggleSaved(sp.id)}
          page={page}
          onPage={setPage}
        />

        <View style={[styles.content, { marginTop: -HERO_OVERLAP }]}>
          <Appear index={0} from="none">
            <View style={styles.pills}>
              <GroupPill code={sp.grp} size="md" />
              <Txt variant="data" tone="faint">
                Nº {String(sp.seq).padStart(4, '0')}
              </Txt>
            </View>
            {hasEsName ? (
              <>
                <Txt variant={name.length > 22 ? 'title' : 'hero'} style={styles.name}>
                  {name}
                </Txt>
                <Txt variant="sci" tone="soft" style={styles.sciLine}>
                  {sp.sci}
                  {sp.gbif_name ? <Txt variant="small" tone="faint">{`  ·  en GBIF: ${sp.gbif_name}`}</Txt> : null}
                </Txt>
              </>
            ) : (
              <>
                <Txt variant="title" style={[styles.name, styles.sciTitle]}>
                  {sp.sci}
                </Txt>
                <Txt variant="small" tone="soft" style={styles.sciLine}>
                  {group?.singular}
                  {sp.family_sci ? ` · familia ${sp.family_sci}` : ''}
                  {sp.gbif_name ? `  ·  en GBIF: ${sp.gbif_name}` : ''}
                </Txt>
              </>
            )}
            {aliases.length > 0 && (
              <View style={styles.aliases}>
                {aliases.map((a) => (
                  <Tag key={a} label={a} tint={g.tint} ink={g.ink} />
                ))}
              </View>
            )}
            <View style={styles.credit}>
              <PhotoCredit image={images[page]} onOpen={(url) => WebBrowser.openBrowserAsync(url)} />
            </View>
            <View style={styles.actionsRow}>
              <ShareCromoButton species={sp} image={images[page] ?? images[0] ?? null} />
              <Press
                haptic
                onPress={() => router.push({ pathname: '/comparar', params: { a: String(sp.id) } })}
                accessibilityRole="button"
                accessibilityLabel="Comparar con otra especie"
                style={[styles.actionBtn, { backgroundColor: palette.surface, borderColor: palette.lineStrong }]}>
                <Icon name="layers" size={20} />
                <Txt variant="bodyStrong">Comparar</Txt>
              </Press>
              <Press
                haptic
                onPress={toggleKids}
                accessibilityRole="switch"
                accessibilityState={{ checked: kids }}
                accessibilityLabel="Modo niños: ficha sencilla con letra grande"
                style={[
                  styles.actionBtn,
                  kids ? { backgroundColor: palette.strong, borderColor: palette.strong } : { backgroundColor: palette.surface, borderColor: palette.lineStrong },
                ]}>
                <Txt variant="bodyStrong" tone={kids ? 'onStrong' : 'ink'}>
                  Aa
                </Txt>
                <Txt variant="label" tone={kids ? 'onStrong' : 'soft'}>
                  Niños
                </Txt>
              </Press>
            </View>
          </Appear>

          {kids && (
            <Appear index={ix()}>
              <View style={styles.kidsList}>
                {facts.map((f) => (
                  <View key={f.text} style={[styles.kidsFact, { backgroundColor: g.tint }]}>
                    <View style={[styles.kidsIcon, { backgroundColor: palette.surface }]}>
                      <Icon name={f.icon} size={36} color={g.color} strokeWidth={2.1} />
                    </View>
                    <Txt variant="heading" style={styles.flex}>
                      {f.text}
                    </Txt>
                  </View>
                ))}
              </View>
            </Appear>
          )}

          {/* Cifras: contadores que suben al abrir la ficha. */}
          {!kids && (
          <Appear index={ix()} style={styles.stats}>
            <StatTile icon="eye" value={sp.rg_obs} label="avistamientos confirmados" color={g.color} tint={g.tint} delay={150} />
            {visibleCountries.length > 0 && (
              <StatTile
                icon="globe"
                value={visibleCountries.length}
                label={visibleCountries.length === 1 ? 'país' : 'países'}
                color={g.color}
                tint={g.tint}
                delay={220}
              />
            )}
            {sp.cities_n ? (
              <StatTile
                icon="pin"
                value={sp.cities_n}
                label={sp.cities_n === 1 ? 'gran ciudad' : 'grandes ciudades'}
                color={g.color}
                tint={g.tint}
                delay={290}
              />
            ) : null}
          </Appear>
          )}

          {/* Qué fácil es verla y cómo está de amenazada. */}
          {!kids && (
          <Appear index={ix()}>
            <Card style={styles.statusCard}>
              <View style={styles.rarityHead}>
                <TrailMark tier={sp.rarity} width={34} />
                <View style={styles.flex}>
                  <Txt variant="subheading">{rarity?.label}</Txt>
                  <Txt variant="small" tone="soft">
                    Qué difícil es encontrarla
                  </Txt>
                </View>
              </View>
              <Meter value={sp.rarity / 5} color={rarityColor} height={10} label="Rareza" valueLabel={`${sp.rarity} de 5`} delay={200} />
              <Meter value={freq} color={g.color} height={10} label="Frecuencia de avistamiento" valueLabel={fmtInt(sp.rg_obs)} delay={300} />
              {sp.iucn ? (
                <>
                  <View style={[styles.rule, { backgroundColor: palette.line }]} />
                  <IucnScale code={sp.iucn} />
                </>
              ) : null}
            </Card>
          </Appear>
          )}

          {/* Tu cromo */}
          <Appear index={ix()}>
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
                  <Txt variant="bodyStrong">{mine.length === 1 ? 'La has avistado una vez' : `La has avistado ${mine.length} veces`}</Txt>
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
                  <Press haptic onPress={() => router.push('/avistar')} style={[styles.cta, { backgroundColor: palette.brand, borderColor: palette.ink }]}>
                    <Icon name="avistar" size={22} color={palette.onBrand} />
                    <Txt variant="bodyStrong" tone="onBrand">
                      Avistar
                    </Txt>
                  </Press>
                </>
              )}
            </View>
          </Appear>

          {sounds.length > 0 && (
            <Appear index={ix()}>
              <Section title="Cómo suena" icon="sparkle" accent={g.ink} tint={g.tint}>
                <SoundSection sounds={sounds} group={g} big={kids} />
              </Section>
            </Appear>
          )}

          {sizeShown && (
            <Appear index={ix()}>
              <Section title={kids ? '¿Cuánto mide?' : 'Su tamaño'} icon="ruler" accent={g.ink} tint={g.tint}>
                <SizeCompare size={sizeShown} grp={sp.grp} group={g} name={name} credit={sizeCredit} big={kids} />
              </Section>
            </Appear>
          )}

          {!kids && paragraphs.length > 0 ? (
            <Appear index={ix()}>
              <Section title="Quién es" icon="sparkle" accent={g.color} tint={g.tint}>
                <ReadMore paragraphs={paragraphs} accent={g.ink} />
                <Press
                  onPress={() =>
                    WebBrowser.openBrowserAsync(
                      `https://${sp.summary_lang ?? 'es'}.wikipedia.org/wiki/${encodeURIComponent(sp.summary_src ?? '')}`,
                    )
                  }
                  style={styles.sourceLink}>
                  <Icon name="external" size={16} color={palette.inkSoft} />
                  <Txt variant="small" tone="soft" style={styles.flex}>
                    Wikipedia {sp.summary_lang === 'en' ? 'en inglés' : 'en español'} · «{sp.summary_src}» · CC BY-SA 4.0
                  </Txt>
                </Press>
              </Section>
            </Appear>
          ) : null}

          {!kids && highlights.length > 0 && (
            <Appear index={ix()}>
              <Section title="Lo que la distingue" icon="star" accent={palette.brandInk} tint={palette.brandTint}>
                <View style={styles.highlights}>
                  {highlights.map((h) => {
                    const look =
                      h.tone === 'red'
                        ? { bg: palette.redTint, fg: palette.red }
                        : h.tone === 'sun'
                          ? { bg: palette.sunTint, fg: palette.brandInk }
                          : { bg: g.tint, fg: g.ink };
                    return (
                      <View key={h.text} style={[styles.highlight, { backgroundColor: look.bg }]}>
                        <Icon name={h.icon} size={22} color={look.fg} />
                        <Txt variant="body" style={styles.flex}>
                          {h.text}
                        </Txt>
                      </View>
                    );
                  })}
                </View>
              </Section>
            </Appear>
          )}

          {!kids && hasLife && (
            <Appear index={ix()}>
              <Section title="Cómo vive" icon="leaf" accent={palette.leaf} tint={palette.leafTint}>
                <LifeStyle
                  medium={sp.medium}
                  envs={sp.envs}
                  diet={sp.diet}
                  dietDetail={sp.diet_detail}
                  repro={sp.repro}
                  activity={sp.activity}
                  migration={sp.migration}
                  domestic={sp.domestic}
                  group={g}
                />
              </Section>
            </Appear>
          )}

          {!kids && season?.data && season.data.total > 0 && (
            <Appear index={ix()}>
              <Section title="Cuándo verla" icon="calendar" accent={palette.sky} tint={palette.skyTint}>
                <Txt variant="body" tone="soft" style={styles.lead}>
                  {season.data.scope === 'cerca' ? 'Avistamientos confirmados a menos de 300 km de ti, por mes.' : 'Avistamientos confirmados en todo el mundo, por mes.'}
                  {peak ? ` Más fácil en ${peak}.` : ''}
                </Txt>
                <MonthBars values={season.data.months} group={g} />
                {hasHours && (
                  <>
                    <Txt variant="small" tone="soft" style={styles.subLead}>
                      Por hora del día (hora local de cada observación; muestra al azar de {fmtInt(season.data.hoursSample)})
                    </Txt>
                    <HourBars values={season.data.hours} group={g} />
                  </>
                )}
                <Txt variant="small" tone="faint" style={styles.subLead}>
                  Fuente: iNaturalist, {fmtInt(season.data.total)} observaciones · consultado {fmtAgo(season.fetchedAt)}
                </Txt>
              </Section>
            </Appear>
          )}

          {!kids && visibleCountries.length > 0 && (
            <Appear index={ix()}>
              <Section
                title="Dónde vive"
                icon="globe"
                accent={palette.sky}
                tint={palette.skyTint}
                aside={
                  <Press
                    onPress={() => router.push({ pathname: '/atlas', params: { focus: String(sp.id) } })}
                    accessibilityRole="button"
                    accessibilityLabel="Ver dónde vive en el Atlas, sin guardarla"
                    style={[styles.inlineBtn, { backgroundColor: palette.strong }]}>
                    <Icon name="atlas" size={18} color={palette.onStrong} />
                    <Txt variant="label" tone="onStrong">
                      Ver en el Atlas
                    </Txt>
                  </Press>
                }>
                <Txt variant="small" tone="soft" style={styles.lead}>
                  Países con al menos {COUNTRY_MIN_OBS} observaciones humanas registradas en GBIF. Nativa, endémica o introducida, según iNaturalist, cuando lo indica.
                </Txt>
                <CountryList rows={visibleCountries} group={g} />
              </Section>
            </Appear>
          )}

          {!kids && (
          <Appear index={ix()}>
            <Section title="Clasificación" icon="layers" accent={g.color} tint={g.tint}>
              <TaxonLadder rungs={rungs} variant="steps" color={g} />
            </Section>
          </Appear>
          )}

          {!kids && breedTotal > 0 && (
            <Appear index={ix()}>
              <Section
                title="Razas"
                icon="heart"
                accent={g.color}
                tint={g.tint}
                aside={
                  <Txt variant="data" tone="faint">
                    {fmtInt(breedTotal)} reconocidas
                  </Txt>
                }>
                <Txt variant="body" tone="soft" style={styles.lead}>
                  {breedPreview.cc ? `Algunas de ${COUNTRY_NAME[breedPreview.cc] ?? breedPreview.cc}. ` : ''}
                  Fuente: {(Object.keys(breedCount) as Authority[]).map((a) => AUTHORITY_LABEL[a]).join(', ')}.
                </Txt>
                {breedPreview.rows.map((b) => (
                  <BreedLine key={b.id} breed={b} tint={g.tint} onPress={(bid) => router.push({ pathname: '/raza/[id]', params: { id: bid } })} />
                ))}
                {breedTotal > breedPreview.rows.length && (
                  <Press onPress={() => router.push({ pathname: '/razas/[id]', params: { id: String(sp.id) } })} style={styles.textBtn}>
                    <Txt variant="label" color={g.ink}>{`Ver las ${fmtInt(breedTotal)} razas`}</Txt>
                  </Press>
                )}
              </Section>
            </Appear>
          )}

          {!kids && similar?.data && similar.data.length > 0 && (
            <Appear index={ix()}>
              <Section title="Con qué se confunde" icon="eye" accent={palette.red} tint={palette.redTint}>
                <Txt variant="body" tone="soft" style={styles.lead}>
                  Especies que la comunidad identificó por error como esta y corrigió después. Si dudas, compáralas.
                </Txt>
                {similar.data.map((s) => (
                  <View key={s.id} style={[styles.similar, { borderBottomColor: palette.line }]}>
                    <Press
                      onPress={() => router.push({ pathname: '/especie/[id]', params: { id: String(s.id) } })}
                      style={styles.similarMain}>
                      <View style={styles.flex}>
                        <Txt variant={similarNames[s.id] ? 'bodyStrong' : 'sci'}>{similarNames[s.id] ?? s.sci}</Txt>
                        {similarNames[s.id] ? (
                          <Txt variant="sci" tone="soft" numberOfLines={1}>
                            {s.sci}
                          </Txt>
                        ) : null}
                        <Txt variant="data" tone="faint">
                          {fmtInt(s.count)} confusiones
                        </Txt>
                      </View>
                      <Icon name="chevronRight" size={18} color={palette.inkFaint} />
                    </Press>
                    <Press
                      haptic
                      onPress={() => router.push({ pathname: '/comparar', params: { a: String(sp.id), b: String(s.id) } })}
                      accessibilityRole="button"
                      accessibilityLabel={`Comparar con ${similarNames[s.id] ?? s.sci}`}
                      style={[styles.compareLink, { backgroundColor: palette.redTint }]}>
                      <Icon name="layers" size={18} color={palette.red} />
                      <Txt variant="label" tone="red">
                        Comparar con esta
                      </Txt>
                    </Press>
                  </View>
                ))}
              </Section>
            </Appear>
          )}

          {kids && (
            <Txt variant="small" tone="faint" style={styles.kidsCredit}>
              Datos de iNaturalist, GBIF y la Lista Roja de la UICN. Fotos y sonidos con licencia libre; sus autores aparecen en cada uno.
            </Txt>
          )}

          {!kids && (
          <Section title="Fuentes" icon="info" accent={palette.inkSoft} tint={palette.surfaceAlt}>
            <Txt variant="small" tone="soft" style={styles.lead}>
              Cada dato de esta ficha viene de su autoridad o de dos fuentes que coinciden. Lo que no cumple eso no se muestra.
            </Txt>
            {[...BASE_PROVENANCE, ...prov]
              .filter((p) => p.sources)
              .map((p) => (
                <View key={p.field} style={[styles.provRow, { borderBottomColor: palette.line }]}>
                  <Txt variant="label" style={styles.provLabel}>
                    {FIELD_LABEL[p.field] ?? p.field}
                  </Txt>
                  <View style={styles.provSources}>
                    {p.sources.split(',').map((code) => {
                      const src = sourceByCode[code];
                      const url = fill(src?.url ?? null);
                      return (
                        <Press key={code} disabled={!url} hitSlop={12} accessibilityRole="link" onPress={() => url && WebBrowser.openBrowserAsync(url)} style={styles.provSource}>
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
              <Txt variant="small" tone="faint" style={styles.subLead}>
                {IUCN_LABEL[sp.iucn]}: categoría global de la Lista Roja. Las listas nacionales pueden diferir.
              </Txt>
            ) : null}
          </Section>
          )}
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.lg },
  pills: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { marginTop: space.sm },
  sciTitle: { fontFamily: fonts.textBoldItalic, fontSize: 28, lineHeight: 32 },
  sciLine: { marginTop: space.xs },
  aliases: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  credit: { marginTop: space.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  statusCard: { marginTop: space.lg, gap: space.lg },
  rarityHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { height: StyleSheet.hairlineWidth },
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
  sourceLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm, minHeight: 48 },
  highlights: { gap: space.sm },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg },
  lead: { marginBottom: space.md },
  subLead: { marginTop: space.lg, marginBottom: space.sm },
  similar: { paddingVertical: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  similarMain: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  compareLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, alignSelf: 'flex-start' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1.5 },
  kidsList: { gap: space.md, marginTop: space.xl },
  kidsFact: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, borderRadius: radius.lg },
  kidsIcon: { width: 64, height: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  kidsCredit: { marginTop: space.xl },
  inlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.pill },
  textBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: space.sm },
  provRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  provLabel: { width: 132 },
  provSources: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  provSource: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
