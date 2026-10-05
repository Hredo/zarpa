import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import { Icon, type IconName } from '@/components/Icon';
import { MapCanvas, type HeatData, type MapCanvasHandle, type MapTap } from '@/components/MapCanvas';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { getAtlasSpecies, type AtlasSpecies } from '@/db/catalog';
import { fmtInt } from '@/lib/format';
import type { GroupCode } from '@/lib/groups';
import { unexploredCells } from '@/lib/heat';
import { useLastLocation } from '@/lib/location';
import { naturalAreasWithSpecies, tooLarge, type NaturalAreas } from '@/lib/naturalAreas';
import { placesInBox, type PlaceCount } from '@/lib/remote';
import { displayName } from '@/lib/speciesName';
import { listSightings, useJournal, type Sighting } from '@/store/journal';
import { duration, ease, elevation, groupColor, radius, space, usePalette } from '@/theme';

/** Tono de la capa de vista previa: se distingue de los ocho de las guardadas. */
const PREVIEW_HUE = 250;

type PlaceInfo = {
  species: AtlasSpecies;
  total: number;
  areas: PlaceCount[];
  provinces: PlaceCount[];
  natural: NaturalAreas | null;
};

/** Lado del recuadro consultado al tocar, según el zoom (≈ lo que ocupa el dedo). */
function boxAround(lng: number, lat: number, zoom: number) {
  const half = Math.max(0.02, 180 / Math.pow(2, zoom + 1.2));
  return { west: lng - half, east: lng + half, south: lat - half * 0.75, north: lat + half * 0.75 };
}

/** Icono del grupo animal (los iconos de grupo se llaman como su código). */
const groupIcon = (grp: string): IconName => (grp as GroupCode) || 'otro';

export default function Atlas() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
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
  const [mapReady, setMapReady] = useState(false);
  /** Capa personal «Mis avistamientos»: mapa de calor y zonas sin explorar. */
  const [mine, setMine] = useState(false);
  /** Especie que se está mirando de pasada desde su ficha: efímera, nunca se guarda sola. */
  const [preview, setPreview] = useState<AtlasSpecies | null>(null);

  useEffect(() => {
    getAtlasSpecies([...saved.keys()]).then(setSpecies);
  }, [saved]);

  useEffect(() => {
    listSightings(500).then(setSightings);
  }, [lastSightingAt]);

  // Vista previa: llega con `focus` desde la ficha. Solo vive en este estado
  // (ni en `saved` ni en la base): al cerrar o salir de la pestaña no deja rastro.
  useEffect(() => {
    const id = Number(params.focus);
    if (!params.focus || !Number.isFinite(id)) return;
    let alive = true;
    getAtlasSpecies([id]).then((rows) => {
      if (alive && rows[0]) {
        setPreview(rows[0]);
        setTap(null);
        setPlaces(null);
      }
    });
    return () => {
      alive = false;
    };
  }, [params.focus]);

  const closePreview = useCallback(() => {
    setPreview(null);
    // La hoja «Esta zona» podría mencionar la especie de la vista previa: se cierra también.
    setTap(null);
    setPlaces(null);
    (navigation as unknown as { setParams: (p: { focus?: string }) => void }).setParams({ focus: undefined });
  }, [navigation]);

  // Al salir de la pestaña, la vista previa se tira.
  useFocusEffect(
    useCallback(
      () => () => {
        closePreview();
      },
      [closePreview],
    ),
  );

  const previewKey = preview?.gbif ?? null;
  const previewId = preview?.id ?? null;
  useEffect(() => {
    if (!mapReady || previewKey == null) return;
    map.current?.fitToSpecies(previewKey);
  }, [mapReady, previewKey, previewId]);

  const previewSaved = preview ? saved.has(preview.id) : false;
  const previewLayerOnly = preview && !previewSaved && preview.gbif ? preview : null;

  const layers = useMemo(() => {
    const own = species
      .filter((s) => s.gbif)
      .map((s) => ({ key: s.gbif as number, hue: saved.get(s.id) ?? 8, visible: !hidden.has(s.id) }));
    if (previewLayerOnly) own.push({ key: previewLayerOnly.gbif as number, hue: PREVIEW_HUE, visible: true });
    return own;
  }, [species, saved, hidden, previewLayerOnly]);

  const pins = useMemo(
    () =>
      sightings
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({ id: s.id, lng: s.lng as number, lat: s.lat as number, label: s.place ?? '' })),
    [sightings],
  );

  const heat = useMemo<HeatData>(() => {
    const pts = sightings.filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
    const center = near ?? pts[0] ?? null;
    return {
      visible: mine,
      points: pts.map((p) => [p.lng, p.lat] as [number, number]),
      cells: mine && center ? unexploredCells(center, pts) : [],
    };
  }, [sightings, near, mine]);

  const onTap = async (t: MapTap) => {
    setTap(t);
    const candidates = previewLayerOnly ? [...species, previewLayerOnly] : species;
    const hit = candidates.filter((s) => s.gbif && t.hits.some((h) => h.key === s.gbif) && !hidden.has(s.id));
    if (hit.length === 0) {
      setPlaces([]);
      return;
    }
    setLoadingPlaces(true);
    const box = boxAround(t.lng, t.lat, t.zoom);
    const out: PlaceInfo[] = [];
    for (const s of hit) {
      const res = await placesInBox(s.gbif as number, box);
      if (res && res.data.total > 0) {
        const nat = await naturalAreasWithSpecies(s.gbif as number, box);
        out.push({ species: s, total: res.data.total, areas: res.data.areas, provinces: res.data.provinces, natural: nat?.data ?? null });
      }
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

  const showLegend = !tap && (layers.length > 0 || pins.length > 0 || mine);
  const previewGroup = preview ? groupColor(preview.grp) : null;
  const previewName = preview ? displayName(preview) : null;

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <MapCanvas
        ref={map}
        dark={false}
        layers={layers}
        pins={pins}
        heat={heat}
        onTap={onTap}
        onReady={() => setMapReady(true)}
        initial={near ? { lng: near.lng, lat: near.lat, zoom: 7 } : undefined}
      />

      <View style={[styles.header, elevation.card, { paddingTop: insets.top + space.sm, backgroundColor: palette.surface }]}>
        <View style={styles.titleRow}>
          <Txt variant="title">Atlas</Txt>
          <View style={styles.headerBtns}>
            {near && (
              <Press onPress={() => map.current?.flyTo(near.lng, near.lat, 10)} accessibilityLabel="Ir a mi posición" style={[styles.iconBtn, { backgroundColor: palette.skyTint }]}>
                <Icon name="locate" size={22} color={palette.sky} />
              </Press>
            )}
            <Press onPress={() => map.current?.fitWorld()} accessibilityLabel="Ver el mundo entero" style={[styles.iconBtn, { backgroundColor: palette.skyTint }]}>
              <Icon name="globe" size={22} color={palette.sky} />
            </Press>
          </View>
        </View>

        <View style={styles.mineRow}>
          <Chip
            label="Mis avistamientos"
            icon="layers"
            selected={mine}
            onPress={() => setMine((v) => !v)}
            accessibilityLabel={mine ? 'Ocultar el mapa de calor de mis avistamientos' : 'Mostrar el mapa de calor de mis avistamientos y las zonas sin explorar'}
          />
        </View>

        {species.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {species.map((s) => {
              const hue = saved.get(s.id) ?? 8;
              const off = hidden.has(s.id);
              const g = groupColor(s.grp);
              return (
                <Press
                  key={s.id}
                  onPress={() => toggle(s.id)}
                  onLongPress={() => router.push({ pathname: '/especie/[id]', params: { id: String(s.id) } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${displayName(s).name}: ${off ? 'oculta en el mapa' : 'visible en el mapa'}. Mantén pulsado para abrir su ficha`}
                  style={[
                    styles.chip,
                    off ? { backgroundColor: palette.surfaceAlt, borderColor: palette.line } : { backgroundColor: g.tint, borderColor: g.color },
                  ]}>
                  <View style={[styles.swatch, { backgroundColor: `hsl(${hue}, 72%, 42%)`, opacity: off ? 0.3 : 1 }]} />
                  <Icon name={groupIcon(s.grp)} size={16} color={off ? palette.inkFaint : g.color} />
                  <Txt
                    variant="label"
                    color={off ? palette.inkFaint : g.ink}
                    numberOfLines={1}
                    style={[displayName(s).isSci ? styles.italic : null, off ? styles.struck : null]}>
                    {displayName(s).name}
                  </Txt>
                </Press>
              );
            })}
          </ScrollView>
        ) : null}

        {preview && previewGroup ? (
          <Animated.View
            key={preview.id}
            entering={FadeInDown.duration(duration.enter).easing(ease.out)}
            exiting={FadeOut.duration(duration.small)}
            style={[styles.banner, { backgroundColor: previewGroup.tint }]}>
            <View style={styles.bannerTop}>
              <View style={[styles.bannerIcon, { backgroundColor: palette.surface }]}>
                <Icon name={groupIcon(preview.grp)} size={22} color={previewGroup.color} />
              </View>
              <View style={styles.fill}>
                <Txt variant="subheading" numberOfLines={2}>
                  Dónde vive: <Txt variant="subheading" style={previewName?.isSci ? styles.italic : null}>{previewName?.name}</Txt>
                </Txt>
                <Txt variant="small" tone="soft">
                  {previewSaved
                    ? 'Ya está guardada en tu Atlas.'
                    : !preview.gbif
                      ? 'No tenemos mapa de observaciones de esta especie.'
                      : 'Vista previa: solo la ves ahora, no se guarda.'}
                </Txt>
              </View>
            </View>
            <View style={styles.bannerBtns}>
              {!previewSaved ? (
                <Press
                  haptic
                  onPress={() => {
                    void useJournal.getState().toggleSaved(preview.id);
                  }}
                  accessibilityLabel={`Guardar ${previewName?.name} en el Atlas`}
                  style={[styles.bannerBtn, { backgroundColor: palette.brand }]}>
                  <Icon name="bookmark" size={18} color={palette.onBrand} />
                  <Txt variant="label" tone="onBrand">
                    Guardar en el Atlas
                  </Txt>
                </Press>
              ) : null}
              <Press
                onPress={closePreview}
                accessibilityLabel="Cerrar la vista previa"
                style={[styles.bannerBtn, { backgroundColor: palette.surface, borderColor: palette.lineStrong, borderWidth: 1 }]}>
                <Icon name="close" size={18} />
                <Txt variant="label">{previewSaved ? 'Listo' : 'Cerrar vista'}</Txt>
              </Press>
            </View>
          </Animated.View>
        ) : null}
      </View>

      {species.length === 0 && !preview && (
        <Animated.View
          entering={FadeInDown.duration(duration.enter).easing(ease.out)}
          style={[styles.emptyCard, elevation.raised, { backgroundColor: palette.surface, bottom: space.xl }]}>
          <View style={[styles.emptyIcon, { backgroundColor: palette.skyTint }]}>
            <Icon name="atlas" size={28} color={palette.sky} />
          </View>
          <Txt variant="heading">Tu Atlas aún está en blanco</Txt>
          <Txt variant="body" tone="soft">
            Guarda las especies que te interesen y aquí se pintan los sitios donde la gente las ha visto. En cada ficha,
            «Dónde vive» te lo enseña sin guardar nada.
          </Txt>
          <Press onPress={() => router.push('/bestiario')} style={[styles.primary, { backgroundColor: palette.brand }]}>
            <Txt variant="bodyStrong" tone="onBrand">
              Explorar el Bestiario
            </Txt>
          </Press>
        </Animated.View>
      )}

      {showLegend && (
        <Animated.View
          entering={FadeIn.duration(duration.enter).easing(ease.out)}
          pointerEvents="none"
          style={[styles.legend, elevation.card, { backgroundColor: palette.surface }]}>
          <View style={styles.legendRow}>
            <View style={styles.ramp}>
              {[0.25, 0.45, 0.65, 0.85].map((o) => (
                <View key={o} style={{ flex: 1, backgroundColor: palette.sky, opacity: o }} />
              ))}
            </View>
            <Txt variant="small" tone="soft">
              Pocas a muchas observaciones
            </Txt>
          </View>
          {mine ? (
            <>
              <View style={styles.legendRow}>
                <View style={[styles.pinDot, { backgroundColor: palette.brand, borderColor: palette.brandInk }]} />
                <Txt variant="small" tone="soft">
                  {pins.length > 0 ? 'Más calor, más avistamientos tuyos' : 'Aún no has fichado nada con ubicación'}
                </Txt>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.pinDot, { backgroundColor: palette.skyTint, borderColor: palette.sky, borderStyle: 'dashed' }]} />
                <Txt variant="small" tone="soft">
                  Zonas de 2,5 km sin avistamientos tuyos
                </Txt>
              </View>
            </>
          ) : null}
          {pins.length > 0 ? (
            <View style={styles.legendRow}>
              <View style={[styles.pinDot, { backgroundColor: palette.brand, borderColor: palette.ink }]} />
              <Txt variant="small" tone="soft">
                Tus avistamientos
              </Txt>
            </View>
          ) : null}
        </Animated.View>
      )}

      {tap && (
        <Animated.View
          entering={FadeIn.duration(duration.small).easing(ease.out)}
          exiting={FadeOut.duration(duration.small)}
          style={[styles.sheet, elevation.raised, { backgroundColor: palette.surface }]}>
          <View style={styles.sheetHead}>
            <Txt variant="subheading">Esta zona</Txt>
            <Press
              onPress={() => {
                setTap(null);
                setPlaces(null);
              }}
              accessibilityLabel="Cerrar la información de esta zona"
              style={[styles.closeBtn, { backgroundColor: palette.surfaceAlt }]}>
              <Icon name="close" size={20} />
            </Press>
          </View>
          {loadingPlaces ? (
            <ActivityIndicator color={palette.brand} style={{ marginVertical: space.lg }} />
          ) : places && places.length > 0 ? (
            <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
              {places.map((p) => {
                const g = groupColor(p.species.grp);
                return (
                  <View key={p.species.id} style={[styles.placeBlock, { borderLeftColor: g.color }]}>
                    <Txt variant="bodyStrong">
                      <Txt variant="bodyStrong" style={displayName(p.species).isSci ? styles.italic : null}>
                        {displayName(p.species).name}
                      </Txt>
                      {`: ${fmtInt(p.total)} ${p.total === 1 ? 'observación' : 'observaciones'}`}
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
                    {p.natural && p.natural.areas.length > 0 && (
                      <View style={styles.natural}>
                        {p.natural.areas.map((a) => (
                          <Txt key={a.name} variant="small">
                            <Txt variant="small" tone="soft">{`${a.kind}: `}</Txt>
                            {`${a.name} · ${fmtInt(a.count)}`}
                          </Txt>
                        ))}
                        <Txt variant="small" tone="faint">
                          {p.natural.sampled < p.natural.total
                            ? `Observaciones dentro de cada espacio, de una muestra de ${fmtInt(p.natural.sampled)} de ${fmtInt(p.natural.total)}.`
                            : 'Observaciones dentro de cada espacio.'}
                        </Txt>
                      </View>
                    )}
                  </View>
                );
              })}
              <Txt variant="small" tone="faint" style={{ marginTop: space.sm }}>
                Registros humanos en GBIF dentro del recuadro tocado, por municipio y provincia (GADM). Espacios naturales:
                © OpenStreetMap.
                {tap && tooLarge(boxAround(tap.lng, tap.lat, tap.zoom)) ? ' Acerca el mapa para ver en qué bosques y parques concretos.' : ''}
              </Txt>
            </ScrollView>
          ) : (
            <Txt variant="body" tone="soft" style={{ marginVertical: space.sm }}>
              No hay observaciones registradas de estas especies justo aquí. Prueba en una zona coloreada.
            </Txt>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  natural: { marginTop: space.xs, gap: 2 },
  header: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  mineRow: { flexDirection: 'row', paddingTop: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBtns: { flexDirection: 'row', gap: space.sm },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: space.sm, paddingTop: space.md, paddingRight: space.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1.5, maxWidth: 240 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  italic: { fontStyle: 'italic' },
  struck: { textDecorationLine: 'line-through' },
  banner: { marginTop: space.md, borderRadius: radius.lg, padding: space.md, gap: space.md },
  bannerTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bannerIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  bannerBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bannerBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.pill },
  emptyCard: { position: 'absolute', left: space.lg, right: space.lg, padding: space.lg, borderRadius: radius.xl, gap: space.sm },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  primary: { marginTop: space.sm, alignSelf: 'flex-start', height: 48, paddingHorizontal: space.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  legend: { position: 'absolute', left: space.md, bottom: space.md, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.lg, gap: space.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ramp: { width: 44, height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  sheet: { position: 'absolute', left: space.md, right: space.md, bottom: space.md, padding: space.lg, borderRadius: radius.xl },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  closeBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  placeBlock: { paddingVertical: space.sm, paddingLeft: space.md, gap: 2, borderLeftWidth: 4, marginBottom: space.xs },
});
