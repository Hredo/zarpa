import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cromo } from '@/components/Cromo';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { TrailMark } from '@/components/TrailMark';
import { Txt } from '@/components/Txt';
import { getSpeciesByIds, type SpeciesRow } from '@/db/catalog';
import { CATALOG_SPECIES } from '@/db/catalogAsset';
import { fmtAgo, fmtInt } from '@/lib/format';
import { useLastLocation, type Coords } from '@/lib/location';
import { nearbySpecies } from '@/lib/remote';
import { listSightings, useJournal, type Sighting } from '@/store/journal';
import { radius, space, usePalette } from '@/theme';

/*
 * Rastro: el punto de partida de cada salida.
 *
 * Lo primero que se ve no es un saludo ni una cifra: es lo que vive cerca
 * ahora mismo y aún no tienes, con foto. Es la razón para salir. Los datos son
 * observaciones confirmadas a menos de 10 km (iNaturalist, en vivo).
 */
export default function Rastro() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const last = useLastLocation();
  const [manual, setManual] = useState<Coords | null>(null);
  const coords = manual ?? last;
  const coordsKey = coords ? `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}` : '';
  const [noPerm, setNoPerm] = useState(false);
  // Resultado etiquetado con las coordenadas que lo produjeron: «cargando» es
  // que lo que hay no corresponde a la posición actual.
  const [found, setFound] = useState<{ key: string; rows: (SpeciesRow & { local: number })[] | null }>({ key: '', rows: null });
  const [recent, setRecent] = useState<Sighting[]>([]);
  const [recentSpecies, setRecentSpecies] = useState<Record<number, SpeciesRow>>({});
  const caught = useJournal((s) => s.caught);
  const lastSightingAt = useJournal((s) => s.lastSightingAt);

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
    listSightings(12).then(async (s) => {
      setRecent(s);
      const rows = await getSpeciesByIds(s.map((x) => x.species_id).filter((x): x is number => x != null));
      setRecentSpecies(Object.fromEntries(rows.map((r) => [r.id, r])));
    });
  }, [lastSightingAt]);

  const askLocation = useCallback(async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    if (!p.granted) return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setManual({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
  }, []);

  const missing = useMemo(() => (nearby ?? []).filter((s) => !caught.has(s.id)), [nearby, caught]);
  const open = useCallback((id: number) => router.push({ pathname: '/especie/[id]', params: { id: String(id) } }), []);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: space.xxxl }}>
      <View style={styles.pad}>
        <View style={styles.brandRow}>
          <Txt variant="hero">Zarpa</Txt>
          <View style={styles.tally}>
            <Txt variant="dataLarge">{fmtInt(caught.size)}</Txt>
            <Txt variant="data" tone="faint">
              especies de {fmtInt(CATALOG_SPECIES)}
            </Txt>
          </View>
        </View>
        <Txt variant="body" tone="soft">
          {lastSightingAt ? `Tu último avistamiento fue ${fmtAgo(lastSightingAt)}.` : 'Tu cuaderno está en blanco. El primer animal que encuentres abre el rastro.'}
        </Txt>
      </View>

      <View style={[styles.pad, styles.sectionHead]}>
        <Txt variant="heading">Cerca de ti y sin fichar</Txt>
      </View>
      <View style={styles.pad}>
        {nearbyState === 'noperm' ? (
          <View style={[styles.card, { borderColor: palette.lineStrong }]}>
            <Txt variant="bodyStrong">¿Qué vive por aquí?</Txt>
            <Txt variant="small" tone="soft">
              Con tu ubicación te enseñamos los animales que la gente ha visto a menos de 10 km. La ubicación no sale
              del móvil salvo para esa consulta.
            </Txt>
            <Press onPress={askLocation} style={[styles.primarySmall, { backgroundColor: palette.forest }]}>
              <Icon name="locate" size={18} color={palette.onForest} />
              <Txt variant="label" tone="onForest">
                Usar mi ubicación
              </Txt>
            </Press>
          </View>
        ) : nearbyState === 'offline' ? (
          <Txt variant="small" tone="faint">
            Sin conexión: los animales cercanos aparecerán cuando vuelva la red.
          </Txt>
        ) : nearbyState === 'loading' || nearby === null ? (
          <Txt variant="small" tone="faint">
            Buscando rastros cerca…
          </Txt>
        ) : missing.length === 0 ? (
          <Txt variant="small" tone="faint">
            Ya tienes todas las especies más vistas a tu alrededor. Toca ampliar el radio en el Atlas.
          </Txt>
        ) : null}
      </View>
      {missing.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
          {missing.slice(0, 20).map((s) => (
            <View key={s.id}>
              <Cromo species={s} caught={false} width={152} onPress={open} />
              <Txt variant="data" tone="faint" style={styles.localCount}>
                {fmtInt(s.local)} vistas aquí
              </Txt>
            </View>
          ))}
        </ScrollView>
      )}
      {missing.length > 0 && (
        <Txt variant="small" tone="faint" style={[styles.pad, { marginTop: space.xs }]}>
          Observaciones confirmadas a menos de 10 km · iNaturalist
        </Txt>
      )}

      <View style={[styles.pad, { marginTop: space.xl }]}>
        <Press
          haptic
          onPress={() => router.push('/avistar')}
          style={[styles.cta, { backgroundColor: palette.forest }]}>
          <View style={styles.ctaText}>
            <Txt variant="title" tone="onForest">
              Salir a avistar
            </Txt>
            <Txt variant="small" tone="onForestSoft">
              Apunta, deja que la IA lo reconozca y ficha su pegatina.
            </Txt>
          </View>
          <View style={[styles.ctaIcon, { backgroundColor: palette.blaze, borderColor: palette.ink }]}>
            <Icon name="avistar" size={30} color={palette.onBlaze} strokeWidth={2.2} />
          </View>
        </Press>
      </View>

      {recent.length > 0 && (
        <>
          <View style={[styles.pad, styles.sectionHead]}>
            <Txt variant="heading">Tus últimas pegatinas</Txt>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
            {recent.map((s, i) => {
              const sp = s.species_id != null ? recentSpecies[s.species_id] : undefined;
              return (
                <Press
                  key={s.id}
                  onPress={() => router.push({ pathname: '/avistamiento/[id]', params: { id: s.id } })}
                  style={[styles.recent, { transform: [{ rotate: `${((i * 37) % 9) - 4}deg` }] }]}>
                  <Image source={s.sticker ?? s.photo} style={styles.recentImg} contentFit="contain" />
                  <Txt variant="label" numberOfLines={1} style={styles.recentName}>
                    {sp ? (sp.name_es ?? sp.name_en ?? sp.sci) : 'Sin especie'}
                  </Txt>
                  {sp ? <TrailMark tier={sp.rarity} width={18} /> : null}
                </Press>
              );
            })}
          </ScrollView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space.lg },
  brandRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space.sm },
  tally: { alignItems: 'flex-end', paddingBottom: 6 },
  sectionHead: { marginTop: space.xxl, marginBottom: space.md },
  card: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  primarySmall: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', height: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, marginTop: space.xs },
  hscroll: { paddingHorizontal: space.lg, gap: space.md },
  localCount: { marginTop: space.xs },
  cta: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  ctaText: { flex: 1, gap: space.xs },
  ctaIcon: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  recent: { width: 120, alignItems: 'center', gap: 4 },
  recentImg: { width: 112, height: 112 },
  recentName: { maxWidth: 120 },
});
