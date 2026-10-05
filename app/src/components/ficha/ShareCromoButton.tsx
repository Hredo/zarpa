import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';

import type { SpeciesDetail, SpeciesImage } from '@/db/catalog';
import { rarityInfo } from '@/lib/groups';
import { shareCard, type CardInput } from '@/lib/shareCard';
import { displayName } from '@/lib/speciesName';
import { expandUrl } from '@/lib/urls';
import { radius, space, usePalette } from '@/theme';

import { Icon } from '../Icon';
import { Press } from '../Press';
import { Txt } from '../Txt';

type Props = {
  species: SpeciesDetail;
  /** Foto de la ficha (con su autor y licencia) cuando se comparte la especie. */
  image?: SpeciesImage | null;
  /** Foto propia del usuario (avistamiento): sustituye a `image` y no lleva crédito. */
  ownPhoto?: { uri: string; sticker?: boolean } | null;
  dateText?: string | null;
  placeText?: string | null;
  label?: string;
  /** `pill` (contorno, para filas de acciones) o `solid` (azul noche, botón principal). */
  tone?: 'pill' | 'solid';
};

const LICENSE_SHORT: Record<string, string> = {
  'cc-by': 'CC BY',
  'cc-by-sa': 'CC BY-SA',
  'cc-by-nc': 'CC BY-NC',
  'cc-by-nd': 'CC BY-ND',
  'cc-by-nc-sa': 'CC BY-NC-SA',
  'cc-by-nc-nd': 'CC BY-NC-ND',
  cc0: 'CC0',
  pd: 'Dominio público',
};

/** Texto de la licencia tal como la guarda el catálogo (Commons: «CC BY-SA 4.0»; iNaturalist: «cc-by»). */
function licenseText(l: string | null): string | null {
  if (!l) return null;
  return LICENSE_SHORT[l.toLowerCase()] ?? l;
}

/** Botón «Compartir»: genera el cromo con Skia, lo guarda en caché y abre la hoja del sistema. */
export function ShareCromoButton({ species, image, ownPhoto, dateText, placeText, label = 'Compartir', tone = 'pill' }: Props) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const dn = displayName(species);
      const photo = ownPhoto?.uri ?? expandUrl(image?.url ?? species.img);
      const lic = licenseText(image?.license ?? null);
      const credit = ownPhoto
        ? null
        : image
          ? `Foto: ${image.author ?? 'autoría desconocida'}${lic ? ` · ${lic}` : ''} · ${image.source === 'inat' ? 'iNaturalist' : 'Wikimedia Commons'}`
          : null;
      const input: CardInput = {
        id: species.id,
        name: dn.name,
        isSci: dn.isSci,
        sci: species.sci,
        grp: species.grp,
        groupLabel: dn.group,
        iucn: species.iucn,
        rarityLabel: rarityInfo(species.rarity).label,
        photo,
        fit: ownPhoto?.sticker ? 'contain' : 'cover',
        dateText,
        placeText,
        credit,
      };
      const ok = await shareCard(input);
      if (!ok) Alert.alert('No se puede compartir', 'Este dispositivo no permite compartir archivos.');
    } catch {
      Alert.alert('No se pudo crear el cromo', 'Inténtalo de nuevo en unos segundos.');
    } finally {
      setBusy(false);
    }
  };

  const solid = tone === 'solid';
  const fg = solid ? palette.onStrong : palette.ink;
  return (
    <Press
      haptic
      onPress={run}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Compartir el cromo como imagen"
      style={[
        styles.btn,
        solid ? { backgroundColor: palette.strong } : { backgroundColor: palette.surface, borderColor: palette.lineStrong, borderWidth: 1.5 },
      ]}>
      {busy ? <ActivityIndicator color={fg} size="small" /> : <Icon name="share" size={20} color={fg} />}
      <Txt variant="bodyStrong" color={fg}>
        {busy ? 'Creando…' : label}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
});
