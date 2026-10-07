import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fmtDate } from '@/lib/format';
import { NET_HEADERS } from '@/lib/urls';
import type { Sound } from '@/lib/sounds';
import { radius, space, usePalette, type GroupColor } from '@/theme';

import { Chip } from '../Chip';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { Txt } from '../Txt';
import { Waveform } from './Waveform';

type Props = { sounds: Sound[]; group: GroupColor; big?: boolean };

/** Un reproductor por grabación: se monta de nuevo al cambiar de sonido, así nunca suenan dos. */
function Player({ sound, group, big }: { sound: Sound; group: GroupColor; big?: boolean }) {
  const palette = usePalette();
  // Con la cabecera de la app: Commons rechaza la que manda Android por defecto.
  const player = useAudioPlayer({ uri: sound.url, headers: NET_HEADERS }, { updateInterval: 150 });
  const status = useAudioPlayerStatus(player);
  const size = big ? 88 : 72;

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) {
      player.seekTo(0).catch(() => {});
    }
    player.play();
  };

  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  const loading = !status.isLoaded;

  return (
    <View style={[styles.player, { backgroundColor: group.tint }]}>
      <Press
        haptic
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pausar el sonido' : 'Escuchar el sonido'}
        style={[styles.play, { width: size, height: size, borderRadius: size / 2, backgroundColor: group.color, borderColor: palette.surface }]}>
        {status.playing ? <PauseGlyph color={palette.surface} /> : <PlayGlyph color={palette.surface} size={size * 0.4} />}
      </Press>
      <View style={styles.wave}>
        <Waveform seed={sound.id} progress={progress} playing={status.playing} color={group.color} />
        <Txt variant="data" tone="faint" style={styles.time}>
          {loading ? 'Cargando…' : `${clock(status.currentTime)} / ${clock(status.duration)}`}
        </Txt>
      </View>
    </View>
  );
}

function PlayGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={styles.playGlyph}>
      <Path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill={color} />
    </Svg>
  );
}

function PauseGlyph({ color }: { color: string }) {
  return (
    <View style={styles.pause}>
      <View style={[styles.pauseBar, { backgroundColor: color }]} />
      <View style={[styles.pauseBar, { backgroundColor: color }]} />
    </View>
  );
}

function clock(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * «Cómo suena»: reproductor de las grabaciones (Commons e iNaturalist) con su
 * autor, licencia, lugar y enlace al original.
 */
export function SoundSection({ sounds, group, big }: Props) {
  const palette = usePalette();
  const [i, setI] = useState(0);
  const sound = sounds[Math.min(i, sounds.length - 1)];

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
  }, []);

  return (
    <View>
      {sounds.length > 1 && (
        <View style={styles.chips}>
          {sounds.map((s, k) => (
            <Chip key={s.id} label={`Grabación ${k + 1}`} selected={k === i} onPress={() => setI(k)} />
          ))}
        </View>
      )}
      <Player key={sound.id} sound={sound} group={group} big={big} />
      <Press
        onPress={() => WebBrowser.openBrowserAsync(sound.obsUrl)}
        accessibilityRole="link"
        accessibilityLabel={`Abrir la grabación original en ${sound.source === 'commons' ? 'Wikimedia Commons' : 'iNaturalist'}`}
        style={styles.credit}>
        <Icon name="external" size={16} color={palette.inkSoft} />
        <Txt variant="small" tone="soft" style={styles.creditText}>
          Grabación de {sound.author}
          {sound.place ? ` · ${sound.place}` : ''}
          {sound.observedOn ? ` · ${fmtDate(sound.observedOn)}` : ''}
        </Txt>
      </Press>
      <Press
        onPress={() => WebBrowser.openBrowserAsync(sound.licenseUrl)}
        accessibilityRole="link"
        accessibilityLabel={`Licencia ${sound.licenseLabel}`}
        style={styles.credit}>
        <Icon name="info" size={16} color={palette.inkSoft} />
        <Txt variant="small" tone="soft" style={styles.creditText}>
          Licencia {sound.licenseLabel} · vía {sound.source === 'commons' ? 'Wikimedia Commons' : 'iNaturalist'}
        </Txt>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  player: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, borderRadius: radius.lg },
  play: { alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  wave: { flex: 1, gap: space.xs },
  time: { alignSelf: 'flex-end' },
  playGlyph: { marginLeft: 3 },
  pause: { flexDirection: 'row', gap: 7 },
  pauseBar: { width: 8, height: 26, borderRadius: 3 },
  credit: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  creditText: { flex: 1 },
});
