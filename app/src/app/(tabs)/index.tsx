import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { CalendarCard } from '@/components/cards/CalendarCard';
import { ExcursionCard } from '@/components/cards/ExcursionCard';
import { Cromo, listThumb } from '@/components/Cromo';
import { GroupPill } from '@/components/GroupPill';
import { GroupTile } from '@/components/GroupTile';
import { HomeAvatar } from '@/components/HomeAvatar';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Meter } from '@/components/Meter';
import { MissionsCard } from '@/components/MissionsCard';
import { Appear } from '@/components/motion/Appear';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { FadeImage } from '@/components/motion/FadeImage';
import { Press } from '@/components/Press';
import { QuizCard } from '@/components/QuizCard';
import { Section } from '@/components/Section';
import { StatTile } from '@/components/StatTile';
import { TrailMark } from '@/components/TrailMark';
import { Txt } from '@/components/Txt';
import { getSpeciesByIds, groupTotals, type SpeciesRow } from '@/db/catalog';
import { catalogInfo } from '@/db';
import { fmtAgo, fmtInt } from '@/lib/format';
import { GROUPS, rarityInfo, type GroupCode } from '@/lib/groups';
import { useLastLocation, type Coords } from '@/lib/location';
import { nearbyRarities, RARITY_DAYS, RARITY_RADIUS_KM, type RareFind } from '@/lib/rarities';
import { rememberArea } from '@/lib/rarityAlerts';
import { nearbySpecies } from '@/lib/remote';
import { displayName } from '@/lib/speciesName';
import { useSpeciesOfTheDay } from '@/lib/speciesOfDay';
import { expandUrl } from '@/lib/urls';
import { useFilters } from '@/store/filters';
import { listSightings, useJournal, type Sighting } from '@/store/journal';
import { useSettings } from '@/store/settings';
import { elevation, groupColor, HIT, radius, space, usePalette } from '@/theme';

const GUTTER = space.lg;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

/*
 * Inicio: acogedor y con una sola acción clara. De arriba abajo: saludo con el
 * logo, el botón grande de Avistar, la especie del día con foto grande, lo que
 * vive cerca de ti, tu progreso y un acceso rápido por grupos. Es una pantalla
 * que se abre pocas veces al día y no se recicla, así que entra escalonada.
 */
export default function Inicio() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const last = useLastLocation();
  const [manual, setManual] = useState<Coords | null>(null);
  const coords = manual ?? last;
  const coordsKey = coords ? `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}` : '';
  const [noPerm, setNoPerm] = useState(false);
  // Resultado etiquetado con las coordenadas que lo produjeron: «cargando» es
  // que lo que hay no corresponde a la posición actual.
  const [found, setFound] = useState<{ key: string; rows: (SpeciesRow & { local: number })[] | null }>({ key: '', rows: null });
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [sightingSpecies, setSightingSpecies] = useState<Record<number, SpeciesRow>>({});
  const [totals, setTotals] = useState<Record<string, number>>({});
  const caught = useJournal((s) => s.caught);
  const lastSightingAt = useJournal((s) => s.lastSightingAt);
  const setFilters = useFilters((s) => s.set);
  const today = useSpeciesOfTheDay();
  const rarityAlerts = useSettings((s) => s.rarityAlerts);
  const [rare, setRare] = useState<{ key: string; rows: RareFind[] }>({ key: '', rows: [] });

  useEffect(() => {
    if (last) return;
    Location.getForegroundPermissionsAsync()
      .then((p) => setNoPerm(!p.granted))
      .catch(() => {});
  }, [last]);

  useEffect(() => {
    if (!coords) return;
    let alive = true;
    nearbySpecies(coords.lat, coords.lng, 10).then(async (res) => {
      if (!alive) return;
      if (!res) {
        setFound({ key: coordsKey, rows: null });
        return;
      }
      const rows = await getSpeciesByIds(res.data.map((n) => n.id));
      const byId = new Map(rows.map((r) => [r.id, r]));
      if (!alive) return;
      setFound({
        key: coordsKey,
        rows: res.data
          .map((n) => (byId.has(n.id) ? { ...byId.get(n.id)!, local: n.count } : null))
          .filter(Boolean) as (SpeciesRow & { local: number })[],
      });
    });
    return () => {
      alive = false;
    };
    // Las coordenadas entran por `coordsKey`: moverse unos metros no repite la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsKey]);

  // Rarezas confirmadas cerca estas dos semanas (y la zona para los avisos, si están activados).
  useEffect(() => {
    if (!coords) return;
    if (rarityAlerts) void rememberArea(coords.lat, coords.lng);
    let alive = true;
    nearbyRarities(coords.lat, coords.lng, useJournal.getState().caught).then((res) => {
      if (alive) setRare({ key: coordsKey, rows: res?.data ?? [] });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsKey, rarityAlerts]);
  const rarities = rare.key === coordsKey ? rare.rows.filter((r) => !caught.has(r.id)) : [];

  const nearby = found.key === coordsKey ? found.rows : null;
  const nearbyState: 'idle' | 'loading' | 'offline' | 'noperm' = !coords
    ? noPerm
      ? 'noperm'
      : 'idle'
    : found.key !== coordsKey
      ? 'loading'
      : found.rows === null
        ? 'offline'
        : 'idle';

  useEffect(() => {
    groupTotals().then((g) => setTotals(Object.fromEntries(g.map((x) => [x.code, x.total]))));
  }, []);

  useEffect(() => {
    listSightings(1000).then(async (s) => {
      setSightings(s);
      const ids = [...new Set(s.map((x) => x.species_id).filter((x): x is number => x != null))];
      const rows = await getSpeciesByIds(ids);
      setSightingSpecies(Object.fromEntries(rows.map((r) => [r.id, r])));
    });
  }, [lastSightingAt]);

  const askLocation = useCallback(async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    if (!p.granted) return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setManual({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
  }, []);

  const missing = useMemo(() => (nearby ?? []).filter((s) => !caught.has(s.id)), [nearby, caught]);
  const explored = useMemo(() => new Set(Object.values(sightingSpecies).map((s) => s.grp)).size, [sightingSpecies]);
  const recent = sightings.slice(0, 12);
  const open = useCallback((id: number) => router.push({ pathname: '/especie/[id]', params: { id: String(id) } }), []);
  const openGroup = useCallback(
    (code: GroupCode) => {
      setFilters({ groups: [code], q: '' });
      router.navigate('/bestiario');
    },
    [setFilters],
  );

  const tileW = Math.floor((width - GUTTER * 2 - space.md * 2) / 3);
  const photoW = width - GUTTER * 2 - 12;
  const photoH = Math.min(Math.round(photoW * 0.72), 360);
  const todayG = today ? groupColor(today.grp) : null;
  const todayName = today ? displayName(today) : null;
  const progress = caught.size / catalogInfo().species;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: space.xxxl, paddingHorizontal: GUTTER }}>
      <Appear from="none">
        <View style={styles.head}>
          <Logo variant="full" size={36} />
          <View style={styles.flex} />
          <HomeAvatar />
        </View>
        <Txt variant="heading" style={styles.hello}>
          {greeting()}
        </Txt>
        <Txt variant="body" tone="soft">
          {lastSightingAt
            ? `Tu último avistamiento fue ${fmtAgo(lastSightingAt)}. ¿Qué descubrimos hoy?`
            : 'Sal a mirar: el primer animal que encuentres abre tu álbum.'}
        </Txt>
      </Appear>

      <Appear index={1} style={styles.block}>
        <Press
          haptic
          onPress={() => router.push('/avistar')}
          accessibilityRole="button"
          accessibilityLabel="Avistar un animal con la cámara"
          style={[styles.cta, elevation.raised, { backgroundColor: palette.brand }]}>
          <View style={styles.ctaText}>
            <Txt variant="title" tone="onBrand">
              Avistar un animal
            </Txt>
            <Txt variant="body" tone="onBrand">
              Apunta con la cámara y la IA lo reconoce.
            </Txt>
          </View>
          <View style={[styles.ctaIcon, { backgroundColor: palette.surface }]}>
            <Icon name="avistar" size={32} color={palette.ink} strokeWidth={2.2} />
          </View>
        </Press>
      </Appear>

      {today && todayG && todayName ? (
        <Appear index={2}>
          <Section title="Especie del día" icon="sparkle" accent={palette.brandInk} tint={palette.brandTint}>
            <Card padding={0} onPress={() => open(today.id)} accessibilityLabel={`Especie del día: ${todayName.name}`}>
              <View style={styles.dayPad}>
                <View style={[styles.dayPhoto, { height: photoH, backgroundColor: todayG.tint }]}>
                  <FadeImage
                    source={expandUrl(today.img) ?? listThumb(today.img)}
                    style={StyleSheet.absoluteFill}
                    placeholderColor={todayG.tint}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.dayPill}>
                    <GroupPill code={today.grp} size="md" />
                  </View>
                </View>
              </View>
              <View style={styles.dayBody}>
                <View style={styles.flex}>
                  <Txt variant="heading" numberOfLines={2} style={todayName.isSci ? styles.italic : undefined}>
                    {todayName.name}
                  </Txt>
                  {!todayName.isSci ? (
                    <Txt variant="sci" tone="soft" numberOfLines={1}>
                      {today.sci}
                    </Txt>
                  ) : null}
                  <View style={styles.dayMeta}>
                    <TrailMark tier={today.rarity} width={24} />
                    <Txt variant="small" tone="soft">
                      {rarityInfo(today.rarity).label}
                    </Txt>
                    {caught.has(today.id) ? (
                      <Txt variant="label" color={palette.leaf}>
                        · Ya en tu cuaderno
                      </Txt>
                    ) : null}
                  </View>
                </View>
                <Icon name="chevronRight" size={24} color={palette.inkSoft} />
              </View>
            </Card>
          </Section>
        </Appear>
      ) : null}

      <Appear index={3}>
        <Section title="Para hoy" icon="calendar" accent={palette.leaf} tint={palette.leafTint}>
          <View style={styles.stack}>
            <QuizCard />
            <ExcursionCard />
            <CalendarCard />
          </View>
        </Section>
      </Appear>

      <Appear index={4}>
        <Section title="Cerca de ti" icon="pin" accent={palette.sky} tint={palette.skyTint}>
          {nearbyState === 'noperm' ? (
            <Card tone="tint" tint={palette.skyTint}>
              <Txt variant="subheading">¿Qué vive por aquí?</Txt>
              <Txt variant="body" tone="soft" style={styles.mt}>
                Con tu ubicación te enseñamos los animales que la gente ha visto a menos de 10 km. Tu ubicación no sale del móvil salvo para esa
                consulta.
              </Txt>
              <Press onPress={askLocation} accessibilityRole="button" style={[styles.btn, { backgroundColor: palette.strong }]}>
                <Icon name="locate" size={20} color={palette.onStrong} />
                <Txt variant="bodyStrong" tone="onStrong">
                  Usar mi ubicación
                </Txt>
              </Press>
            </Card>
          ) : nearbyState === 'offline' ? (
            <Card tone="outline">
              <Txt variant="body" tone="soft">
                Sin conexión. Los animales de tu zona aparecerán cuando vuelva la red.
              </Txt>
            </Card>
          ) : nearbyState === 'loading' ? (
            <Card tone="outline">
              <Txt variant="body" tone="soft">
                Buscando qué se ha visto cerca…
              </Txt>
            </Card>
          ) : coords && nearby && missing.length === 0 ? (
            <Card tone="tint" tint={palette.leafTint}>
              <Txt variant="subheading">¡Tienes todo lo que vive a tu alrededor!</Txt>
              <Txt variant="body" tone="soft" style={styles.mt}>
                Amplía el radio en el Atlas para descubrir más.
              </Txt>
            </Card>
          ) : null}
        </Section>
        {missing.length > 0 ? (
          <View style={styles.bleed}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
              {missing.slice(0, 20).map((s) => (
                <View key={s.id}>
                  <Cromo species={s} caught={false} width={152} onPress={open} />
                  <Txt variant="small" tone="soft" style={styles.localCount}>
                    {fmtInt(s.local)} {s.local === 1 ? 'vista' : 'vistas'} aquí
                  </Txt>
                </View>
              ))}
            </ScrollView>
            <Txt variant="small" tone="faint" style={styles.credit}>
              Aún sin fichar · observaciones confirmadas a menos de 10 km, de iNaturalist
            </Txt>
          </View>
        ) : null}
      </Appear>

      {rarities.length > 0 ? (
        <Appear index={5}>
          <Section title="Rarezas cerca de ti" icon="star" accent={palette.red} tint={palette.redTint}>
            <Txt variant="body" tone="soft">
              {`${rarities.length === 1 ? 'Una especie rara confirmada' : `${fmtInt(rarities.length)} especies raras confirmadas`} a menos de ${RARITY_RADIUS_KM} km en los últimos ${RARITY_DAYS} días. ¿Sales a buscarlas?`}
            </Txt>
          </Section>
          <View style={styles.bleed}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
              {rarities.slice(0, 12).map((s) => (
                <View key={s.id}>
                  <Cromo species={s} caught={false} width={152} onPress={open} />
                  <Txt variant="small" tone="soft" style={styles.localCount}>
                    {fmtInt(s.seen)} {s.seen === 1 ? 'vez' : 'veces'} estos días
                  </Txt>
                </View>
              ))}
            </ScrollView>
            <Txt variant="small" tone="faint" style={styles.credit}>
              Observaciones confirmadas de iNaturalist · no se muestra dónde para proteger a las especies
            </Txt>
          </View>
        </Appear>
      ) : null}

      <Appear index={5}>
        <Section title="Tu progreso" icon="star" accent={palette.brandInk} tint={palette.sunTint}>
          <Card>
            <View style={styles.progressTop}>
              <AnimatedNumber value={caught.size} variant="hero" />
              <Txt variant="body" tone="soft" style={styles.progressOf}>
                de {fmtInt(catalogInfo().species)} especies
              </Txt>
            </View>
            <Meter value={Math.max(progress, caught.size > 0 ? 0.015 : 0)} color={palette.brand} height={12} style={styles.mt} />
            {caught.size === 0 ? (
              <Txt variant="small" tone="soft" style={styles.mt}>
                Cada especie que fiches se suma aquí.
              </Txt>
            ) : null}
          </Card>
          <View style={styles.tiles}>
            <StatTile icon="eye" value={sightings.length} label="avistamientos" color={palette.sky} tint={palette.skyTint} delay={120} />
            <StatTile
              icon="globe"
              value={explored}
              label={explored === 1 ? 'grupo explorado' : 'grupos explorados'}
              color={palette.leaf}
              tint={palette.leafTint}
              delay={200}
            />
          </View>
        </Section>
      </Appear>

      <Appear index={6}>
        <Section title="Retos" icon="flag" accent={palette.brandInk} tint={palette.brandTint}>
          <MissionsCard />
        </Section>
      </Appear>

      <Appear index={7}>
        <Section title="Explora por grupos" icon="bestiario" accent={palette.ink} tint={palette.strongTint}>
          <View style={styles.grid}>
            {GROUPS.filter((g) => (totals[g.code] ?? 0) > 0)
              .slice(0, 9)
              .map((g) => (
                <GroupTile key={g.code} code={g.code} total={totals[g.code]} width={tileW} onPress={openGroup} />
              ))}
          </View>
          <Press onPress={() => router.navigate('/bestiario')} accessibilityRole="button" style={[styles.btnGhost, { borderColor: palette.lineStrong }]}>
            <Txt variant="bodyStrong">Ver todo el Bestiario</Txt>
            <Icon name="chevronRight" size={20} color={palette.ink} />
          </Press>
        </Section>
      </Appear>

      {recent.length > 0 ? (
        <Appear index={8}>
          <Section title="Tus últimas pegatinas" icon="cuaderno" accent={palette.brandInk} tint={palette.brandTint}>
            <View style={styles.bleed}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
                {recent.map((s, i) => {
                  const sp = s.species_id != null ? sightingSpecies[s.species_id] : undefined;
                  const g = groupColor(sp?.grp);
                  const nm = sp ? displayName(sp) : null;
                  return (
                    <Press
                      key={s.id}
                      onPress={() => router.push({ pathname: '/avistamiento/[id]', params: { id: s.id } })}
                      accessibilityRole="button"
                      accessibilityLabel={nm?.name ?? 'Avistamiento'}
                      style={styles.recent}>
                      <View style={[styles.recentBack, { backgroundColor: g.tint }]}>
                        <FadeImage
                          source={s.sticker ?? s.photo}
                          style={[styles.recentImg, { transform: [{ rotate: `${((i * 37) % 9) - 4}deg` }] }]}
                          contentFit="contain"
                          placeholderColor="transparent"
                        />
                      </View>
                      <Txt variant="label" numberOfLines={1} style={[styles.recentName, nm?.isSci ? styles.italic : null]}>
                        {nm?.name ?? 'Sin especie'}
                      </Txt>
                    </Press>
                  );
                })}
              </ScrollView>
            </View>
          </Section>
        </Appear>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
  hello: { marginBottom: space.xs },
  block: { marginTop: space.xl },
  flex: { flex: 1 },
  italic: { fontStyle: 'italic' },
  mt: { marginTop: space.sm },
  cta: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.xl, paddingVertical: space.xl, paddingHorizontal: space.xl, gap: space.lg, minHeight: 112 },
  ctaText: { flex: 1, gap: space.xs },
  ctaIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  dayPad: { padding: 6 },
  dayPhoto: { borderRadius: radius.md, overflow: 'hidden' },
  dayPill: { position: 'absolute', left: space.sm, bottom: space.sm },
  dayBody: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg },
  dayMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: HIT, paddingHorizontal: space.xl, borderRadius: radius.pill, alignSelf: 'flex-start', marginTop: space.md },
  btnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, height: HIT, borderRadius: radius.pill, borderWidth: 1.5, marginTop: space.lg },
  bleed: { marginHorizontal: -GUTTER, marginTop: space.md },
  hscroll: { paddingHorizontal: GUTTER, gap: space.md, paddingBottom: space.sm },
  localCount: { marginTop: space.xs },
  credit: { marginTop: space.sm, paddingHorizontal: GUTTER },
  progressTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  progressOf: { flexShrink: 1 },
  tiles: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  recent: { width: 112, alignItems: 'center', gap: space.xs },
  recentBack: { width: 112, height: 112, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  recentImg: { width: 100, height: 100 },
  recentName: { maxWidth: 112 },
});
