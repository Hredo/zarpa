import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { Meter } from '@/components/Meter';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { fmtClock } from '@/lib/diaryFormat';
import { adoptRecording, removeVoiceFile, voiceExists, voiceUri } from '@/lib/voiceFiles';
import { duration, ease, radius, space, usePalette } from '@/theme';

const MAX_MS = 120_000;

type Props = {
  sightingId: string;
  /** Ruta relativa guardada en `sighting.voice_note`, o null. */
  voiceNote: string | null;
  voiceMs: number | null;
  onChange: (voice: { voice_note: string | null; voice_ms: number | null }) => void;
};

/**
 * Nota de voz del avistamiento: grabar (hasta 2 min) con expo-audio, guardar
 * el fichero en documentos y reproducirlo con barra de progreso. Pedir el
 * micrófono ocurre solo al pulsar «Grabar», nunca al abrir la pantalla.
 */
export function VoiceNote({ sightingId, voiceNote, voiceMs, onChange }: Props) {
  const palette = usePalette();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const [busy, setBusy] = useState(false);
  const stopping = useRef(false);

  const start = async () => {
    if (busy || state.isRecording) return;
    setBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Zarpa necesita el micrófono', 'Para grabar una nota de voz permite el micrófono en los ajustes del móvil.', [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
        ]);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert('No se pudo grabar', 'Inténtalo de nuevo en un momento.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    setBusy(true);
    const ms = state.durationMillis;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (recorder.uri) {
        const rel = await adoptRecording(recorder.uri, sightingId);
        removeVoiceFile(voiceNote);
        onChange({ voice_note: rel, voice_ms: ms });
      }
    } catch {
      Alert.alert('No se pudo guardar la grabación', 'Inténtalo de nuevo.');
    } finally {
      stopping.current = false;
      setBusy(false);
    }
  };

  // Tope de 2 minutos: una nota de campo es una frase, no un podcast.
  useEffect(() => {
    if (state.isRecording && state.durationMillis >= MAX_MS) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isRecording, state.durationMillis]);

  const remove = () =>
    Alert.alert('¿Borrar la nota de voz?', 'Se elimina la grabación de este avistamiento.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          removeVoiceFile(voiceNote);
          onChange({ voice_note: null, voice_ms: null });
        },
      },
    ]);

  if (state.isRecording) {
    return (
      <View style={[styles.row, { backgroundColor: palette.redTint }]}>
        <RecDot />
        <View style={styles.flex}>
          <Txt variant="bodyStrong">Grabando…</Txt>
          <Txt variant="data" tone="soft">
            {fmtClock(state.durationMillis)} / {fmtClock(MAX_MS)}
          </Txt>
        </View>
        <Press haptic onPress={stop} accessibilityLabel="Terminar la grabación" style={[styles.round, { backgroundColor: palette.red }]}>
          <Icon name="stop" size={22} color={palette.surface} />
        </Press>
      </View>
    );
  }

  if (voiceNote && voiceExists(voiceNote)) {
    return <VoicePlayer key={voiceNote} uri={voiceUri(voiceNote)} knownMs={voiceMs} onDelete={remove} onReplace={start} busy={busy} />;
  }

  return (
    <Press
      haptic
      disabled={busy}
      onPress={start}
      accessibilityRole="button"
      accessibilityLabel="Grabar una nota de voz"
      style={[styles.row, { backgroundColor: palette.surfaceAlt }]}>
      <View style={[styles.round, { backgroundColor: palette.surface }]}>
        <Icon name="mic" size={22} color={palette.ink} />
      </View>
      <View style={styles.flex}>
        <Txt variant="bodyStrong">Grabar una nota de voz</Txt>
        <Txt variant="small" tone="soft">
          Cuenta lo que ves u oyes. Hasta 2 minutos; se queda en tu móvil.
        </Txt>
      </View>
    </Press>
  );
}

function VoicePlayer({
  uri,
  knownMs,
  onDelete,
  onReplace,
  busy,
}: {
  uri: string;
  knownMs: number | null;
  onDelete: () => void;
  onReplace: () => void;
  busy: boolean;
}) {
  const palette = usePalette();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration * 1000 : (knownMs ?? 0);
  const at = status.currentTime * 1000;

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (status.didJustFinish || (total > 0 && at >= total - 150)) await player.seekTo(0);
    player.play();
  };

  return (
    <View style={[styles.row, { backgroundColor: palette.surfaceAlt }]}>
      <Press
        haptic
        onPress={toggle}
        accessibilityLabel={status.playing ? 'Pausar la nota de voz' : 'Reproducir la nota de voz'}
        style={[styles.round, { backgroundColor: palette.strong }]}>
        <Icon name={status.playing ? 'pause' : 'play'} size={22} color={palette.onStrong} />
      </Press>
      <View style={styles.flex}>
        <Meter value={total > 0 ? at / total : 0} color={palette.strong} trackColor={palette.line} height={8} />
        <View style={styles.times}>
          <Txt variant="data" tone="soft">
            {fmtClock(at)}
          </Txt>
          <Txt variant="data" tone="soft">
            {fmtClock(total)}
          </Txt>
        </View>
      </View>
      <Press onPress={onReplace} disabled={busy} accessibilityLabel="Grabar de nuevo la nota de voz" style={styles.small}>
        <Icon name="mic" size={20} color={palette.inkSoft} />
      </Press>
      <Press onPress={onDelete} accessibilityLabel="Borrar la nota de voz" style={styles.small}>
        <Icon name="trash" size={20} color={palette.danger} />
      </Press>
    </View>
  );
}

/** Punto rojo que respira mientras se graba (solo opacidad; quieto con «reducir movimiento»). */
function RecDot() {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    o.set(withRepeat(withTiming(0.35, { duration: duration.fill, easing: ease.inOut }), -1, true));
  }, [o, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[styles.dot, { backgroundColor: palette.red }, style]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, minHeight: 72 },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  small: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  dot: { width: 14, height: 14, borderRadius: 7, marginHorizontal: space.sm },
});
