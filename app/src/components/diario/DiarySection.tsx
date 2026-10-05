import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Appear } from '@/components/motion';
import { Txt } from '@/components/Txt';
import { dayPhase } from '@/lib/dayPhase';
import { fmtTime } from '@/lib/format';
import { fetchWeather, weatherFromFields, weatherToFields } from '@/lib/weather';
import { useJournal, type Sighting, type SightingPatch } from '@/store/journal';
import { radius, space, type, usePalette } from '@/theme';

import { VoiceNote } from './VoiceNote';
import { WeatherCard } from './WeatherCard';

type Props = {
  sighting: Sighting;
  /** Aplica el cambio al estado de la pantalla (la base ya se ha actualizado). */
  onPatch: (patch: SightingPatch) => void;
};

const FRESH_MS = 3 * 3_600_000;

/**
 * Diario de campo de un avistamiento: clima y momento del día, notas de texto
 * (se guardan solas al dejar de escribir) y nota de voz. Cada bloque escribe en
 * `cuaderno.db` a través de `updateSighting`.
 */
export function DiarySection({ sighting: s, onPatch }: Props) {
  const palette = usePalette();
  const update = useJournal((st) => st.updateSighting);
  const [note, setNote] = useState(s.note ?? '');
  const [saved, setSaved] = useState(false);
  const [fetching, setFetching] = useState(false);
  // «Reciente» se fija al abrir la pantalla: el clima de ahora solo vale para un avistamiento de hace poco.
  const [fresh] = useState(() => Date.now() - new Date(s.created_at).getTime() < FRESH_MS);
  const last = useRef(s.note ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = async (text: string) => {
    const value = text.trim() === '' ? null : text;
    if ((value ?? '') === last.current) return;
    last.current = value ?? '';
    await update(s.id, { note: value });
    onPatch({ note: value });
    setSaved(true);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onChangeNote = (text: string) => {
    setNote(text);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(text), 900);
  };

  const weather = weatherFromFields(s);
  const phase = s.day_phase ?? dayPhase(s.created_at);
  const canFetch = !weather && s.lat != null && s.lng != null && fresh;

  const fetchNow = async () => {
    if (s.lat == null || s.lng == null) return;
    setFetching(true);
    const w = await fetchWeather(s.lat, s.lng);
    setFetching(false);
    if (w) {
      const fields = weatherToFields(w);
      await update(s.id, fields);
      onPatch(fields);
    }
  };

  return (
    <View style={styles.wrap}>
      <Appear index={1}>
        <WeatherCard weather={weather} phase={phase} timeLabel={fmtTime(s.created_at)} onFetch={canFetch ? fetchNow : undefined} fetching={fetching} />
      </Appear>

      <Appear index={2} style={styles.block}>
        <Txt variant="subheading">Tus notas</Txt>
        <TextInput
          value={note}
          onChangeText={onChangeNote}
          onBlur={() => {
            if (timer.current) clearTimeout(timer.current);
            void commit(note);
          }}
          multiline
          maxLength={2000}
          placeholder="Qué hacía, cómo se comportaba, qué había alrededor…"
          placeholderTextColor={palette.inkFaint}
          textAlignVertical="top"
          accessibilityLabel="Notas del avistamiento"
          style={[type.body, styles.input, { color: palette.ink, backgroundColor: palette.surface, borderColor: palette.line }]}
        />
        <Txt variant="small" tone="faint" style={styles.status}>
          {saved ? 'Guardado en tu cuaderno' : 'Se guarda solo al dejar de escribir'}
        </Txt>
      </Appear>

      <Appear index={3} style={styles.block}>
        <Txt variant="subheading">Nota de voz</Txt>
        <VoiceNote
          sightingId={s.id}
          voiceNote={s.voice_note}
          voiceMs={s.voice_ms}
          onChange={async (voice) => {
            await update(s.id, voice);
            onPatch(voice);
          }}
        />
      </Appear>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xl },
  block: { marginTop: space.xl, gap: space.sm },
  input: { minHeight: 112, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  status: { marginTop: space.xs },
});
