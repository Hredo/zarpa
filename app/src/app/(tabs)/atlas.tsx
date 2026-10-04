import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { MapCanvas, type MapCanvasHandle, type MapTap } from '@/components/MapCanvas';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { getAtlasSpecies, type AtlasSpecies } from '@/db/catalog';
import { fmtInt } from '@/lib/format';
import { useLastLocation } from '@/lib/location';
import { placesInBox, type PlaceCount } from '@/lib/remote';
import { listSightings, useJournal, type Sighting } from '@/store/journal';
import { duration, ease, radius, space, useIsDark, usePalette } from '@/theme';

type PlaceInfo = {
  species: AtlasSpecies;
  total: number;
  areas: PlaceCount[];
  provinces: PlaceCount[];
};

/** Lado del recuadro consultado al tocar, según el zoom (≈ lo que ocupa el dedo). */
function boxAround(lng: number, lat: number, zoom: number) {
  const half = Math.max(0.02, 180 / Math.pow(2, zoom + 1.2));
  return { west: lng - half, east: lng + half, south: lat - half * 0.75, north: lat + half * 0.75 };
}

export default function Atlas() {
  const palette = usePalette();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ focus?: string }>();
  const map = useRef<MapCanvasHandle>(null);
  const near = useLastLocation();

  const saved = useJournal((s) => s.saved);
  const lastSightingAt = useJournal((s) => s.lastSightingAt);
  const [species, setSpecies] = useState<AtlasSpecies[]>([]);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [tap, setTap] = useState<MapTap | null>(null);
  const [places, setPlaces] = useState<PlaceInfo[] | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState(false);

  useEffect(() => {
    getAtlasSpecies([...saved.keys()]).then(setSpecies);
  }, [saved]);

  useEffect(() => {
    listSightings(500).then(setSightings);
  }, [lastSightingAt]);

  useEffect(() => {
    if (params.focus) map.current?.fitWorld();
  }, [params.focus]);

  const layers = useMemo(
    () =>
      species
        .filter((s) => s.gbif)
        .map((s) => ({ key: s.gbif as number, hue: saved.get(s.id) ?? 8, visible: !hidden.has(s.id) })),
    [species, saved, hidden],
  );

  const pins = useMemo(
    () =>
      sightings
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({ id: s.id, lng: s.lng as number, lat: s.lat as number, label: s.place ?? '' })),
    [sightings],
  );

  const onTap = async (t: MapTap) => {
    setTap(t);
    const hit = species.filter((s) => s.gbif && t.hits.some((h) => h.key === s.gbif) && !hidden.has(s.id));
    if (hit.length === 0) {
      setPlaces([]);
      return;
    }
    setLoadingPlaces(true);
    const box = boxAround(t.lng, t.lat, t.zoom);
    const out: PlaceInfo[] = [];
    for (const s of hit) {
      const res = await placesInBox(s.gbif as number, box);
      if (res && res.data.total > 0) out.push({ species: s, total: res.data.total, areas: res.data.areas, provinces: res.data.provinces });
    }
    setPlaces(out);
    setLoadingPlaces(false);
  };

  const toggle = (id: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <MapCanvas
        ref={map}
        dark={dark}
        layers={layers}
        pins={pins}
        onTap={onTap}
        initial={near ? { lng: near.lng, lat: near.lat, zoom: 7 } : undefined}
      />

      <View style={[styles.header, { paddingTop: insets.top + space.sm, backgroundColor: palette.surface, borderBottomColor: palette.line }]}>
        <View style={styles.titleRow}>
          <Txt variant="title">Atlas</Txt>
          <View style={styles.headerBtns}>
            {near && (
              <Press onPress={() => map.current?.flyTo(near.lng, near.lat, 10)} accessibilityLabel="Ir a mi posición" style={[styles.iconBtn, { borderColor: palette.line }]}>
                <Icon name="locate" size={20} />
              </Press>
            )}
            <Press onPress={() => map.current?.fitWorld()} accessibilityLabel="Ver el mundo" style={[styles.iconBtn, { borderColor: palette.line }]}>
              <Icon name="globe" size={20} />
            </Press>
          </View>
        </View>
        {species.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {species.map((s) => {
              const hue = saved.get(s.id) ?? 8;
              const off = hidden.has(s.id);
              return (
                <Press
                  key={s.id}
                  onPress={() => toggle(s.id)}
                  onLongPress={() => router.push({ pathname: '/especie/[id]', params: { id: String(s.id) } })}
                  accessibilityLabel={`${s.name_es ?? s.sci}: ${off ? 'oculta' : 'visible'}`}
                  style={[styles.chip, { borderColor: palette.line, backgroundColor: off ? palette.surfaceAlt : palette.surface }]}>
                  <View style={[styles.swatch, { backgroundColor: `hsl(${hue}, 72%, ${dark ? 58 : 42}%)`, opacity: off ? 0.3 : 1 }]} />
                  <Txt variant="label" tone={off ? 'faint' : 'ink'} numberOfLines={1}>
                    {s.name_es ?? s.name_en ?? s.sci}
                  </Txt>
                </Press>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {species.length === 0 && (
        <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.line, bottom: space.xl }]}>
          <Txt variant="heading">Tu atlas está en blanco</Txt>
          <Txt variant="body" tone="soft">
            Guarda especies desde su ficha y aquí se pintan los sitios donde la gente las ha visto. Toca una zona para
            saber en qué comarca o provincia.
          </Txt>
          <Press onPress={() => router.push('/bestiario')} style={[styles.primary, { backgroundColor: palette.blaze, borderColor: palette.ink }]}>
            <Txt variant="bodyStrong" tone="onBlaze">
              Abrir el Bestiario
            </Txt>
          </Press>
        </View>
      )}

      {tap && (
        <Animated.View
          entering={FadeIn.duration(duration.small).easing(ease.out)}
          exiting={FadeOut.duration(duration.small)}
          style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <View style={styles.sheetHead}>
            <Txt variant="subheading">Esta zona</Txt>
            <Press onPress={() => { setTap(null); setPlaces(null); }} accessibilityLabel="Cerrar" hitSlop={10}>
              <Icon name="close" size={20} />
            </Press>
          </View>
          {loadingPlaces ? (
            <ActivityIndicator color={palette.ink} style={{ marginVertical: space.lg }} />
          ) : places && places.length > 0 ? (
            <ScrollView style={{ maxHeight: 260 }}>
              {places.map((p) => (
                <View key={p.species.id} style={styles.placeBlock}>
                  <Txt variant="bodyStrong">
                    {p.species.name_es ?? p.species.sci}: {fmtInt(p.total)} observaciones
                  </Txt>
                  {p.areas.length > 0 && (
                    <Txt variant="small" tone="soft">
                      Sobre todo en {p.areas.slice(0, 4).map((a) => `${a.name} (${fmtInt(a.count)})`).join(', ')}
                    </Txt>
                  )}
                  {p.provinces.length > 0 && (
                    <Txt variant="small" tone="faint">
                      {p.provinces.slice(0, 3).map((a) => a.name).join(' · ')}
                    </Txt>
                  )}
                </View>
              ))}
              <Txt variant="small" tone="faint" style={{ marginTop: space.sm }}>
                Recuento de registros humanos en GBIF dentro del recuadro tocado, agrupados por unidad administrativa (GADM).
              </Txt>
            </ScrollView>
          ) : (
            <Txt variant="body" tone="soft" style={{ marginVertical: space.sm }}>
              No hay observaciones registradas de tus especies justo aquí. Prueba en una zona coloreada.
            </Txt>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBtns: { flexDirection: 'row', gap: space.sm },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: space.sm, paddingTop: space.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, maxWidth: 220 },
  swatch: { width: 14, height: 14, borderRadius: 3 },
  emptyCard: { position: 'absolute', left: space.lg, right: space.lg, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, gap: space.sm },
  primary: { marginTop: space.sm, alignSelf: 'flex-start', height: 48, paddingHorizontal: space.xl, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', left: space.md, right: space.md, bottom: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  placeBlock: { paddingVertical: space.sm, gap: 2 },
});
