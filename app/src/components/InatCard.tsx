import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { canContribute, connectInat, inatEnabled, InatCancelled, InatError, inatObservationUrl, loadInat, uploadToInat, useInat } from '@/lib/inat';
import { useJournal, type Sighting } from '@/store/journal';
import { HIT, radius, space, usePalette } from '@/theme';

import { Card } from './Card';
import { Icon } from './Icon';
import { Press } from './Press';
import { Txt } from './Txt';

type Props = {
  sighting: Sighting;
  /** Nombre científico, para el «species_guess» de iNaturalist. */
  sci?: string | null;
  /** Avisa a la pantalla del avistamiento de los campos guardados. */
  onPatch: (patch: Pick<Sighting, 'inat_id' | 'inat_uploaded_at'>) => void;
  /** Especie amenazada o rara: se propone ocultar la ubicación exacta. */
  sensitive?: boolean;
};

/**
 * «Aportar a iNaturalist»: publica el avistamiento (foto, especie, fecha y
 * lugar) en la cuenta de iNaturalist de la persona. Si la comunidad confirma la
 * especie, llega a GBIF y sirve a la ciencia. Se oculta si iNaturalist no está
 * configurado o al avistamiento le falta especie o lugar.
 */
export function InatCard({ sighting, sci, onPatch, sensitive }: Props) {
  const palette = usePalette();
  const status = useInat((s) => s.status);
  const login = useInat((s) => s.login);
  const busyConnect = useInat((s) => s.busy);
  const [obscure, setObscure] = useState(!!sensitive);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadInat();
  }, []);

  if (!inatEnabled) return null;

  if (sighting.inat_id) {
    return (
      <Card tone="tint" tint={palette.leafTint} style={styles.card}>
        <View style={styles.head}>
          <Icon name="check" size={20} color={palette.leaf} />
          <Txt variant="subheading" style={styles.fill}>
            Aportado a iNaturalist
          </Txt>
        </View>
        <Txt variant="small" tone="soft" style={styles.gap}>
          Cuando la comunidad confirme la especie, también llegará a GBIF.
        </Txt>
        {message ? (
          <Txt variant="small" tone="danger" style={styles.gap}>
            {message}
          </Txt>
        ) : null}
        <Press
          onPress={() => void WebBrowser.openBrowserAsync(inatObservationUrl(sighting.inat_id!))}
          accessibilityRole="link"
          style={[styles.btn, { backgroundColor: palette.surface }]}>
          <Icon name="external" size={18} color={palette.ink} />
          <Txt variant="bodyStrong">Ver en iNaturalist</Txt>
        </Press>
      </Card>
    );
  }

  if (!canContribute(sighting)) return null;

  const connected = status === 'connected';

  const publish = async () => {
    setMessage(null);
    try {
      if (!connected) await connectInat();
      setPhase('uploading');
      const res = await uploadToInat(sighting, { obscure, sci });
      const patch = { inat_id: res.id, inat_uploaded_at: new Date().toISOString() };
      await useJournal.getState().updateSighting(sighting.id, patch);
      onPatch(patch);
      setPhase('idle');
      if (!res.photo) setMessage('La observación se creó, pero la foto no se pudo subir. Añádela desde iNaturalist.');
    } catch (e) {
      setPhase(e instanceof InatCancelled ? 'idle' : 'error');
      if (!(e instanceof InatCancelled)) setMessage(e instanceof InatError ? e.message : 'No se pudo publicar. Inténtalo más tarde.');
    }
  };

  const busy = busyConnect || phase === 'uploading';

  return (
    <Card tone="outline" style={styles.card}>
      <View style={styles.head}>
        <Icon name="globe" size={20} color={palette.leaf} />
        <Txt variant="subheading" style={styles.fill}>
          Aportar a la ciencia
        </Txt>
      </View>
      <Txt variant="body" tone="soft" style={styles.gap}>
        Publica este avistamiento en iNaturalist. Si la comunidad confirma la especie, pasa a GBIF, la base mundial de biodiversidad que usan los
        científicos.
      </Txt>
      <View style={styles.toggle}>
        <View style={styles.fill}>
          <Txt variant="bodyStrong" nativeID="inat-obscure">
            Ocultar el lugar exacto
          </Txt>
          <Txt variant="small" tone="soft">
            {sensitive ? 'Recomendado: es una especie sensible.' : 'Se mostrará en un área de unos 20 km.'}
          </Txt>
        </View>
        <Switch
          value={obscure}
          onValueChange={setObscure}
          accessibilityLabelledBy="inat-obscure"
          accessibilityLabel="Ocultar el lugar exacto en iNaturalist"
          trackColor={{ false: palette.lineStrong, true: palette.leaf }}
          thumbColor={palette.surface}
          ios_backgroundColor={palette.lineStrong}
        />
      </View>
      {message ? (
        <Txt variant="small" tone="danger" style={styles.gap} accessibilityLiveRegion="polite">
          {message}
        </Txt>
      ) : null}
      <Press disabled={busy} onPress={() => void publish()} haptic accessibilityRole="button" style={[styles.btn, { backgroundColor: palette.leaf }]}>
        <Txt variant="bodyStrong" tone="onStrong">
          {phase === 'uploading' ? 'Publicando…' : busyConnect ? 'Conectando…' : connected ? 'Publicar en iNaturalist' : 'Conectar con iNaturalist y publicar'}
        </Txt>
      </Press>
      <Txt variant="small" tone="faint" style={styles.gap}>
        {connected && login ? `Se publicará como @${login}, con las licencias de tu cuenta de iNaturalist.` : 'Se abrirá iNaturalist para que autorices a Zarpa.'}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  fill: { flex: 1 },
  gap: { marginTop: space.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  btn: { flexDirection: 'row', gap: space.sm, minHeight: HIT + 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: space.lg, paddingHorizontal: space.lg },
});
