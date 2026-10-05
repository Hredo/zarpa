import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
  type CameraRef,
  type FlashMode,
  type Frame,
} from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';

import { COCO_ANIMALS } from '@/ai/config';
import { Stabilizer, type Rank, type Verdict } from '@/ai/decision';
import { candidatesFor, getDetector, getEmbedder, judge, startAI, useAI } from '@/ai/engine';
import { centerSquare, channelsOf, cropBuffer, imageFormatOf, squareAround } from '@/ai/frames';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { CaptureReview } from '@/components/scanner/CaptureReview';
import { LadderHud } from '@/components/scanner/LadderHud';
import { Reticle } from '@/components/scanner/Reticle';
import { Txt } from '@/components/Txt';
import { getSpeciesByIds } from '@/db/catalog';
import { discardCapture, processCapture, type CaptureResult } from '@/lib/capture';
import { displayName } from '@/lib/speciesName';
import { prepareCutout } from '@/lib/cutout';
import { fmt1 } from '@/lib/format';
import { countryOf, currentLocation, type Coords } from '@/lib/location';
import { duration, ease, radius, space, usePalette } from '@/theme';

/*
 * El visor.
 *
 * Dos ritmos sobre el mismo fotograma (640×480, ya girado al vertical):
 *   - el detector, en cada fotograma, dice DÓNDE hay un animal y la retícula
 *     se engancha a él;
 *   - el modelo de especies, cada ~0,6 s, dice QUÉ es, sobre un recorte
 *     cuadrado alrededor del animal (o del centro si el detector no lo ve: el
 *     detector solo conoce diez tipos de animal, el de especies decenas de miles).
 *
 * La escalera de abajo se va encendiendo nivel a nivel con los umbrales
 * calibrados. El fichaje NO usa este veredicto en vivo: dispara una foto en
 * alta resolución y la identifica de nuevo (ver lib/capture.ts).
 */

const ANIMALS = [...COCO_ANIMALS];
const EMBED_EVERY_N_FRAMES = 18; // ~0,6 s a 30 fps
const FRAME_ASPECT = 480 / 640;

type Phase = 'live' | 'capturing' | 'review';

const LEVEL_ES: Record<string, string> = {
  class: 'la clase',
  order: 'el orden',
  family: 'la familia',
  genus: 'el género',
};

const CLASS_ES: Record<string, string> = {
  Aves: 'Aves',
  Mammalia: 'Mamíferos',
  Reptilia: 'Reptiles',
  Amphibia: 'Anfibios',
  Actinopterygii: 'Peces',
  Insecta: 'Insectos',
  Arachnida: 'Arácnidos',
  Gastropoda: 'Caracoles y babosas',
  Bivalvia: 'Bivalvos',
  Malacostraca: 'Crustáceos',
};

export default function Avistar() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width: viewW, height: viewH } = useWindowDimensions();
  const permission = useCameraPermission();
  const device = useCameraDevice('back', { physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'] });
  const camera = useRef<CameraRef>(null);
  const ai = useAI();

  const [active, setActive] = useState(AppState.currentState === 'active');
  const [phase, setPhase] = useState<Phase>('live');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [lockedName, setLockedName] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [candidates, setCandidates] = useState<number[] | undefined>(undefined);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [zoomLabel, setZoomLabel] = useState('1×');

  const stabilizer = useRef(new Stabilizer(3));
  const lastBox = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const lastSeen = useRef(0);

  // --- arranque -------------------------------------------------------------
  useEffect(() => {
    startAI().catch(() => {});
    prepareCutout().catch(() => {});
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!permission.hasPermission && permission.canRequestPermission) permission.requestPermission();
  }, [permission]);

  // El país restringe los candidatos a lo que se puede ver allí. Se pide la
  // ubicación aquí, que es donde tiene sentido para el usuario.
  useEffect(() => {
    currentLocation()
      .then(async (c) => {
        if (!c) return;
        setCoords(c);
        const cc = await countryOf(c);
        setCandidates(await candidatesFor(cc));
      })
      .catch(() => {});
  }, []);

  // --- zoom -----------------------------------------------------------------
  const zoom = useSharedValue(device?.minZoom ?? 1);
  const minZoom = device?.minZoom ?? 1;
  const maxZoom = Math.min(device?.maxZoom ?? 8, 30);

  // «1×» es el gran angular principal. En un dispositivo virtual de iOS con
  // ultra gran angular, el zoom 1 es el ultra gran angular y el principal está
  // en el primer cambio de objetivo; en Android el zoom ya viene en esa escala.
  const base = useMemo(() => {
    if (!device) return 1;
    const hasUltra = device.physicalDevices.some((d) => d.type === 'ultra-wide-angle');
    return hasUltra && device.zoomLensSwitchFactors.length > 0 && device.minZoom >= 1 ? device.zoomLensSwitchFactors[0] : 1;
  }, [device]);

  useEffect(() => {
    if (device) zoom.set(Math.max(device.minZoom, Math.min(base, device.maxZoom)));
  }, [device, base, zoom]);

  useAnimatedReaction(
    () => Math.round((zoom.get() / base) * 10) / 10,
    (v, prev) => {
      if (v !== prev) scheduleOnRN(setZoomLabel, `${v}`.replace('.', ',') + '×');
    },
    [base],
  );

  const presets = useMemo(() => {
    if (!device) return [];
    const out = new Set<number>([minZoom / base, 1, 2]);
    for (const f of device.zoomLensSwitchFactors) out.add(f / base);
    if (maxZoom / base >= 10) out.add(10);
    return [...out]
      .map((v) => Math.round(v * 10) / 10)
      .filter((v, i, a) => v * base >= minZoom - 0.01 && v * base <= maxZoom + 0.01 && a.indexOf(v) === i)
      .sort((a, b) => a - b);
  }, [device, base, minZoom, maxZoom]);

  const pinchStart = useSharedValue(1);
  // Pellizcar para el zoom corre en el hilo de la interfaz, sin pasar por JS.
  // Tocar para enfocar lo hace la propia cámara (gesto nativo de VisionCamera).
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          pinchStart.set(zoom.get());
        })
        .onUpdate((e) => {
          zoom.set(Math.min(maxZoom, Math.max(minZoom, pinchStart.get() * e.scale)));
        }),
    [pinchStart, zoom, maxZoom, minZoom],
  );

  // --- retícula -------------------------------------------------------------
  const defaultSide = Math.min(viewW, viewH) * 0.62;
  const rx = useSharedValue((viewW - defaultSide) / 2);
  const ry = useSharedValue((viewH - defaultSide) / 2 - 40);
  const rw = useSharedValue(defaultSide);
  const rh = useSharedValue(defaultSide);
  const lock = useSharedValue(0);

  const moveReticle = useCallback(
    (x: number, y: number, w: number, h: number, ms: number) => {
      const t = { duration: ms, easing: ease.out };
      rx.set(withTiming(x, t));
      ry.set(withTiming(y, t));
      rw.set(withTiming(w, t));
      rh.set(withTiming(h, t));
    },
    [rx, ry, rw, rh],
  );

  /** Del espacio normalizado del fotograma (4:3 vertical) a la vista («cover»). */
  const toView = useCallback(
    (b: { x: number; y: number; w: number; h: number }) => {
      const fw = 1;
      const fh = 1 / FRAME_ASPECT;
      const scale = Math.max(viewW / fw, viewH / fh);
      const offX = (viewW - fw * scale) / 2;
      const offY = (viewH - fh * scale) / 2;
      return { x: b.x * scale + offX, y: b.y * fh * scale + offY, w: b.w * scale, h: b.h * fh * scale };
    },
    [viewW, viewH],
  );

  // --- bucle en vivo ----------------------------------------------------------
  const onLive = useCallback(
    (box: number[] | null, embedding: number[] | null) => {
      const now = Date.now();
      if (box) {
        lastBox.current = { x: box[0], y: box[1], w: box[2], h: box[3] };
        lastSeen.current = now;
        const v = toView(lastBox.current);
        moveReticle(v.x, v.y, v.w, v.h, 160);
        if (lock.get() === 0) lock.set(1);
      } else if (now - lastSeen.current > 1200 && lastBox.current) {
        lastBox.current = null;
        moveReticle((viewW - defaultSide) / 2, (viewH - defaultSide) / 2 - 40, defaultSide, defaultSide, duration.enter);
        lock.set(0);
      }
      if (embedding) {
        const v = judge(Float32Array.from(embedding), candidates);
        setVerdict(v);
        const fixed = stabilizer.current.push(v?.speciesId ?? null);
        if (fixed && v?.speciesId) {
          if (lock.get() !== 2) Haptics.selectionAsync().catch(() => {});
          lock.set(2);
          getSpeciesByIds([v.speciesId]).then(([s]) => setLockedName(s ? displayName(s).name : null));
        } else if (!v?.speciesId) {
          if (lock.get() === 2) lock.set(lastBox.current ? 1 : 0);
          setLockedName(null);
        }
      }
    },
    [toView, moveReticle, lock, viewW, viewH, defaultSide, candidates],
  );

  const detector = ai.detector === 'ready' ? getDetector() : null;
  const embedder = ai.species === 'ready' ? getEmbedder() : null;
  const frameCounter = useMemo(() => createSynchronizable(0), []);

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      if (!detector && !embedder) return;
      const fmt = frame.pixelFormat as string;
      const ch = channelsOf(fmt);
      const w = frame.width;
      const h = frame.height;
      const stride = frame.bytesPerRow;
      const raw = new Uint8Array(frame.getPixelBuffer());
      const data = stride === w * ch ? raw : cropBuffer(raw, stride, ch, { x: 0, y: 0, w, h });
      const image = { data, width: w, height: h, format: imageFormatOf(fmt), layout: 'hwc' as const };

      let best: { x: number; y: number; w: number; h: number; c: number } | null = null;
      if (detector) {
        const found = detector.detectObjectsWorklet(image, { confidenceThreshold: 0.4 });
        for (const d of found) {
          if (ANIMALS.indexOf(String(d.label)) < 0) continue;
          const b = d.box as unknown as { xmin: number; ymin: number; xmax: number; ymax: number };
          if (!best || d.confidence > best.c) best = { x: b.xmin, y: b.ymin, w: b.xmax - b.xmin, h: b.ymax - b.ymin, c: d.confidence };
        }
      }

      let embedding: number[] | null = null;
      const n = frameCounter.getDirty() + 1;
      frameCounter.setBlocking(n);
      if (embedder && n % EMBED_EVERY_N_FRAMES === 0) {
        const sq = best ? squareAround(best, w, h) : centerSquare(w, h);
        const crop = cropBuffer(data, w * ch, ch, sq);
        const side = Math.floor(sq.w);
        const out = embedder.embedWorklet({ data: crop, width: side, height: Math.floor(sq.h), format: imageFormatOf(fmt), layout: 'hwc' });
        embedding = Array.from(out);
      }
      scheduleOnRN(onLive, best ? [best.x / w, best.y / h, best.w / w, best.h / h] : null, embedding);
    },
    [detector, embedder, frameCounter, onLive],
  );

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'rgb',
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrame,
  });
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'quality' });

  // --- disparo --------------------------------------------------------------
  const shoot = useCallback(async () => {
    if (phase !== 'live') return;
    setPhase('capturing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const photo = await photoOutput.capturePhoto({ flashMode: flash }, {});
      // Sin animal detectado, el recorte es el centro de la retícula.
      const box = lastBox.current ?? { x: 0.19, y: 0.5 - 0.31 * FRAME_ASPECT, w: 0.62, h: 0.62 * FRAME_ASPECT };
      const result = await processCapture(photo, box, candidates, Crypto.randomUUID());
      setCapture(result);
      setPhase('review');
    } catch {
      setPhase('live');
    }
  }, [phase, photoOutput, flash, candidates]);

  const retry = useCallback(() => {
    if (capture) discardCapture(capture);
    setCapture(null);
    stabilizer.current.reset();
    setPhase('live');
  }, [capture]);

  // --- render ---------------------------------------------------------------
  if (!permission.hasPermission) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: palette.strongDeep, padding: space.xl }]}>
        <View style={[styles.permIcon, { backgroundColor: palette.brand }]}>
          <Icon name="camera" size={40} color={palette.onBrand} />
        </View>
        <Txt variant="title" tone="onStrong" align="center" style={{ marginTop: space.xl }}>
          Necesitamos la cámara
        </Txt>
        <Txt variant="body" tone="onStrongSoft" align="center" style={{ marginTop: space.sm }}>
          El visor reconoce al animal en directo y su foto se convierte en tu cromo. La IA funciona en tu móvil y las
          fotos no salen de él.
        </Txt>
        <Press
          haptic
          onPress={() => permission.requestPermission()}
          style={[styles.primary, { backgroundColor: palette.brand, marginTop: space.xl }]}>
          <Txt variant="bodyStrong" tone="onBrand">
            Dar permiso de cámara
          </Txt>
        </Press>
        <Press onPress={() => router.back()} style={{ marginTop: space.lg, padding: space.md }}>
          <Txt variant="bodyStrong" tone="onStrong">
            Ahora no
          </Txt>
        </Press>
      </View>
    );
  }

  // Qué le dice el visor al usuario en cada momento: una frase, sin jerga.
  const hint = (() => {
    if (phase === 'capturing') return 'Revelando tu foto…';
    if (lockedName) return `Es ${lockedName}. Pulsa el botón para fichar.`;
    if (verdict?.level && verdict.level !== 'species' && verdict.taxon) {
      return `Parece de ${LEVEL_ES[verdict.level]} ${verdict.taxon}. Acércate o espera un momento para afinar.`;
    }
    if (verdict) return 'Aún no lo tengo claro. Acércate, busca más luz o cambia de ángulo.';
    return 'Apunta al animal y mantén el móvil quieto.';
  })();

  const names: Partial<Record<Rank, string | null>> = {
    class: verdict?.ladder.class ? (CLASS_ES[verdict.ladder.class.name] ?? verdict.ladder.class.name) : null,
  };

  return (
    <View style={[styles.fill, { backgroundColor: palette.strongDeep }]}>
      <StatusBar style="light" />
      <GestureDetector gesture={pinch}>
        <View style={styles.fill}>
          {device ? (
            <Camera
              ref={camera}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={active && phase === 'live'}
              outputs={[photoOutput, frameOutput]}
              zoom={zoom}
              enableNativeTapToFocusGesture
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.fill, styles.center]}>
              <Txt variant="body" tone="onStrong">
                No se encuentra la cámara trasera
              </Txt>
            </View>
          )}
          <Reticle x={rx} y={ry} w={rw} h={rh} lock={lock} color={palette.onStrong} lockColor={palette.brand} />
        </View>
      </GestureDetector>

      {/* Barra superior */}
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <Press onPress={() => router.back()} accessibilityLabel="Cerrar el visor" style={styles.roundDark}>
          <Icon name="close" color={palette.onStrong} />
        </Press>
        <AiStatus />
        <Press
          onPress={() => setFlash((f) => (f === 'off' ? 'auto' : f === 'auto' ? 'on' : 'off'))}
          accessibilityLabel={`Flash: ${flash === 'off' ? 'apagado' : flash === 'auto' ? 'automático' : 'encendido'}`}
          style={styles.roundDark}>
          <Icon name={flash === 'off' ? 'flashOff' : 'flash'} color={flash === 'on' ? palette.brand : palette.onStrong} />
          {flash === 'auto' && (
            <Txt variant="data" tone="onStrong" style={styles.flashAuto}>
              A
            </Txt>
          )}
        </Press>
      </View>

      {/* Escalera, zoom y disparador */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]} pointerEvents="box-none">
        {ai.species === 'ready' ? (
          <>
            <View
              accessibilityLiveRegion="polite"
              style={[styles.hint, { backgroundColor: lockedName ? palette.brand : palette.scrim }]}>
              <Txt variant="bodyStrong" tone={lockedName ? 'onBrand' : 'onStrong'} align="center">
                {hint}
              </Txt>
            </View>
            <LadderHud verdict={verdict} speciesName={lockedName} names={names} />
          </>
        ) : (
          <View style={[styles.notice, { backgroundColor: palette.scrim }]}>
            <Txt variant="small" tone="onStrong" align="center">
              {ai.species === 'loading'
                ? `Preparando el reconocimiento de especies… ${fmt1(ai.speciesProgress * 100)} %`
                : 'El reconocimiento de especies aún no está instalado: haz la foto y elige la especie tú. Se guardará como «sin verificar».'}
            </Txt>
          </View>
        )}

        <View style={styles.zoomRow}>
          {presets.map((p) => {
            const selected = zoomLabel === `${p}`.replace('.', ',') + '×';
            return (
              <Press
                key={p}
                onPress={() => zoom.set(withTiming(p * base, { duration: duration.enter, easing: ease.out }))}
                accessibilityLabel={`Zoom ${p} aumentos`}
                style={[styles.zoomPill, { backgroundColor: selected ? palette.surface : palette.scrim }]}>
                <Txt variant="data" color={selected ? palette.ink : palette.onStrong}>
                  {`${p}`.replace('.', ',')}×
                </Txt>
              </Press>
            );
          })}
          {!presets.some((p) => zoomLabel === `${p}`.replace('.', ',') + '×') && (
            <View style={[styles.zoomPill, { backgroundColor: palette.surface }]}>
              <Txt variant="data" color={palette.ink}>
                {zoomLabel}
              </Txt>
            </View>
          )}
        </View>

        <View style={styles.shutterRow}>
          <Press
            haptic={false}
            onPress={shoot}
            disabled={phase !== 'live'}
            accessibilityLabel={lockedName ? `Fichar ${lockedName}` : 'Hacer la foto'}
            style={[
              styles.shutter,
              { borderColor: lockedName ? palette.brand : palette.onStrong, opacity: phase === 'live' ? 1 : 0.5 },
            ]}>
            <View style={[styles.shutterCore, { backgroundColor: lockedName ? palette.brand : palette.onStrong }]} />
          </Press>
          {lockedName ? (
            <Txt variant="label" color={palette.brand} style={styles.shutterLabel}>
              Fichar
            </Txt>
          ) : null}
        </View>
      </View>

      {phase === 'review' && capture && (
        <CaptureReview capture={capture} coords={coords} candidates={candidates} onRetry={retry} />
      )}
    </View>
  );
}

function AiStatus() {
  const ai = useAI();
  const palette = usePalette();
  const text =
    ai.detector === 'loading'
      ? `Preparando el detector… ${fmt1(ai.detectorProgress * 100)} %`
      : ai.detector === 'error'
        ? 'Sin detector en este móvil'
        : ai.species === 'ready'
          ? 'IA lista'
          : ai.species === 'loading'
            ? 'Preparando la IA…'
            : 'Detector listo';
  const dot = ai.detector === 'error' ? palette.red : ai.detector === 'loading' || ai.species === 'loading' ? palette.sun : palette.leaf;
  return (
    <View style={[styles.status, { backgroundColor: palette.scrim }]}>
      <View style={[styles.statusDot, { backgroundColor: dot }]} />
      <Txt variant="label" tone="onStrong" numberOfLines={1}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  roundDark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(12, 21, 41, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashAuto: { position: 'absolute', right: 6, bottom: 4, fontSize: 10 },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 32, borderRadius: radius.pill, maxWidth: '60%' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  hint: { alignSelf: 'center', marginHorizontal: space.lg, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.lg },
  permIcon: { width: 80, height: 80, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: space.md },
  notice: { marginHorizontal: space.lg, padding: space.md, borderRadius: radius.md },
  zoomRow: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  zoomPill: {
    minWidth: 44,
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 21, 41, 0.55)',
  },
  shutterRow: { alignItems: 'center', gap: 4 },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  shutterCore: { width: 60, height: 60, borderRadius: 30 },
  shutterLabel: { position: 'absolute', bottom: -16 },
  primary: { height: 52, paddingHorizontal: space.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
