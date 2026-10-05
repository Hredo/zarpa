import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { Card } from '@/components/Card';
import { listThumb } from '@/components/Cromo';
import { Icon } from '@/components/Icon';
import { MapCanvas, type MapCanvasHandle, type WarmProgress } from '@/components/MapCanvas';
import { Meter } from '@/components/Meter';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { fmtDate } from '@/lib/format';
import {
  estimateDownload,
  fmtBytes,
  listZones,
  OFFLINE_RADII_KM,
  prefetchPhotos,
  saveZone,
  tilesForArea,
  type OfflineZone,
} from '@/lib/offline';
import { radius, space, usePalette } from '@/theme';

type Props = {
  coords: { lat: number; lng: number } | null;
  place: string | null;
  /** Fotos (miniaturas del catálogo) de las especies de la zona. */
  imgs: (string | null)[];
};

const MAX_PHOTOS = 60;

type Stage = 'idle' | 'photos' | 'map' | 'done';

/**
 * «Descargar esta zona»: precarga las fotos de las especies de alrededor en la
 * caché de expo-image y las teselas del mapa base en la del navegador del
 * mapa. Muestra el tamaño estimado antes de empezar y se puede cancelar.
 */
export function OfflineSection({ coords, place, imgs }: Props) {
  const palette = usePalette();
  const [radiusKm, setRadiusKm] = useState<number>(OFFLINE_RADII_KM[1]);
  const [stage, setStage] = useState<Stage>('idle');
  const [photoProg, setPhotoProg] = useState({ done: 0, total: 0 });
  const [tileProg, setTileProg] = useState<WarmProgress>({ done: 0, total: 0, failed: 0 });
  const [zones, setZones] = useState<OfflineZone[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const map = useRef<MapCanvasHandle>(null);
  const cancelled = useRef(false);
  const photoResult = useRef({ ok: 0, failed: 0 });
  const zoneId = useRef('');

  useEffect(() => {
    listZones().then(setZones);
  }, [stage]);

  const photos = useMemo(
    () => [...new Set(imgs.map((u) => listThumb(u)).filter((u): u is string => !!u))].slice(0, MAX_PHOTOS),
    [imgs],
  );
  const tiles = useMemo(() => (coords ? tilesForArea(coords, radiusKm) : []), [coords, radiusKm]);
  const est = estimateDownload(tiles.length, photos.length);

  const start = () => {
    if (!coords) return;
    cancelled.current = false;
    photoResult.current = { ok: 0, failed: 0 };
    zoneId.current = Crypto.randomUUID();
    setMapReady(false);
    setTileProg({ done: 0, total: tiles.length, failed: 0 });
    setPhotoProg({ done: 0, total: photos.length });
    setStage('photos');
    prefetchPhotos(photos, (done, total) => setPhotoProg({ done, total }), () => cancelled.current).then((r) => {
      photoResult.current = r;
      if (cancelled.current) return;
      setStage('map');
    });
  };

  const cancel = () => {
    cancelled.current = true;
    map.current?.cancelWarm();
    setStage('idle');
  };

  // Con el mapa oculto listo y en la fase de mapa, se piden las teselas.
  useEffect(() => {
    if (stage === 'map' && mapReady) map.current?.warmTiles(tiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, mapReady]);

  const onWarm = useCallback(
    (p: WarmProgress) => {
      setTileProg(p);
      if ((p.finished || p.error) && coords && !cancelled.current) {
        const failed = p.failed;
        void saveZone({
          id: zoneId.current,
          lat: coords.lat,
          lng: coords.lng,
          radiusKm,
          place,
          at: new Date().toISOString(),
          photos: photoResult.current.ok,
          photosFailed: photoResult.current.failed,
          tiles: Math.max(0, p.done - failed),
          tilesFailed: failed,
          mapOk: !!p.finished && !p.error && failed < Math.max(1, p.total) / 2,
        }).then(() => setStage('done'));
      }
    },
    [coords, radiusKm, place],
  );

  const busy = stage === 'photos' || stage === 'map';
  const total = photoProg.total + tileProg.total;
  const done = photoProg.done + tileProg.done;
  const last = zones[0];

  return (
    <Section title="Sin conexión" icon="download" accent={palette.sky} tint={palette.skyTint}>
      <Card>
        <Txt variant="body" tone="soft">
          En el campo suele faltar la cobertura. Antes de salir puedes guardar en el móvil las fotos de estas especies y el
          mapa de los alrededores.
        </Txt>

        <View style={styles.chips}>
          {OFFLINE_RADII_KM.map((r) => (
            <Chip key={r} label={`${r} km`} selected={radiusKm === r} onPress={busy ? undefined : () => setRadiusKm(r)} />
          ))}
        </View>

        {!coords ? (
          <Txt variant="small" tone="faint">
            Necesito tu ubicación para saber qué zona descargar.
          </Txt>
        ) : (
          <>
            <View style={[styles.estimate, { backgroundColor: palette.skyTint }]}>
              <Icon name="download" size={22} color={palette.sky} />
              <View style={styles.flex}>
                <Txt variant="bodyStrong">Tamaño estimado: {fmtBytes(est.bytes)}</Txt>
                <Txt variant="small" tone="soft">
                  {est.photos} fotos (≈ {fmtBytes(est.photoBytes)}) y {est.tiles} teselas del mapa (≈ {fmtBytes(est.tileBytes)}). Es una
                  estimación con medidas reales de ejemplo; gasta datos si no estás en wifi.
                </Txt>
              </View>
            </View>

            {busy ? (
              <View style={styles.progress}>
                <Meter
                  value={total > 0 ? done / total : 0}
                  color={palette.sky}
                  label={stage === 'photos' ? 'Guardando fotos…' : 'Guardando el mapa…'}
                  valueLabel={`${done} de ${total}`}
                />
                <Press onPress={cancel} accessibilityRole="button" style={[styles.btn, { backgroundColor: palette.surfaceAlt }]}>
                  <Txt variant="bodyStrong">Cancelar</Txt>
                </Press>
              </View>
            ) : (
              <Press
                haptic
                onPress={start}
                disabled={photos.length === 0 && tiles.length === 0}
                accessibilityRole="button"
                style={[styles.btn, { backgroundColor: palette.strong }]}>
                <Icon name="download" size={20} color={palette.onStrong} />
                <Txt variant="bodyStrong" tone="onStrong">
                  {stage === 'done' ? 'Descargar otra vez' : 'Descargar esta zona'}
                </Txt>
              </Press>
            )}

            {stage === 'done' && last ? (
              <Txt variant="small" tone="soft">
                {`Listo: ${last.photos} fotos${last.photosFailed ? ` (${last.photosFailed} no se pudieron bajar)` : ''}. ${
                  last.mapOk
                    ? 'El mapa queda en la caché del móvil.'
                    : 'El mapa no se pudo guardar del todo (¿sin conexión?); inténtalo con cobertura.'
                }`}
              </Txt>
            ) : null}
          </>
        )}

        <Txt variant="small" tone="faint">
          Las fotos vienen de Wikimedia Commons e iNaturalist. El mapa base es de OpenFreeMap (© OpenStreetMap), que no admite
          descargas masivas: por eso solo guardamos un radio pequeño. Es caché del sistema, así que el móvil puede liberarla
          cuando le falte espacio, y el estilo del mapa caduca a las 24 h.
        </Txt>

        {zones.length > 0 ? (
          <View style={styles.zones}>
            <Txt variant="label" tone="soft">
              Descargas anteriores
            </Txt>
            {zones.slice(0, 3).map((z) => (
              <Txt key={z.id} variant="small">
                {`${z.place ?? 'Zona sin nombre'} · ${z.radiusKm} km · ${fmtDate(z.at)}`}
              </Txt>
            ))}
          </View>
        ) : null}
      </Card>

      {/* Mapa diminuto e invisible: es el que pide las teselas, para que queden en
          la misma caché que usará el Atlas. Solo existe mientras se descarga el mapa. */}
      {stage === 'map' && coords ? (
        <View pointerEvents="none" style={styles.hiddenMap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MapCanvas
            ref={map}
            dark={false}
            layers={[]}
            pins={[]}
            initial={{ lng: coords.lng, lat: coords.lat, zoom: 12 }}
            onReady={() => setMapReady(true)}
            onWarm={onWarm}
          />
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', gap: space.sm, marginVertical: space.md },
  estimate: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, marginBottom: space.md },
  progress: { gap: space.md },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 52, borderRadius: radius.pill, paddingHorizontal: space.xl },
  zones: { marginTop: space.md, gap: space.xs },
  hiddenMap: { position: 'absolute', width: 8, height: 8, opacity: 0.02, overflow: 'hidden', left: 0, top: 0 },
});
