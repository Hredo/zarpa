import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { GroupPill } from '@/components/GroupPill';
import { HoloSticker } from '@/components/HoloSticker';
import { Icon } from '@/components/Icon';
import { Appear } from '@/components/motion';
import { Press } from '@/components/Press';
import { TrailMark } from '@/components/TrailMark';
import { Txt } from '@/components/Txt';
import { getBreed, getSpecies, type Breed, type SpeciesDetail } from '@/db/catalog';
import { fmt1, fmtCoords, fmtDate, fmtTime } from '@/lib/format';
import { displayName } from '@/lib/speciesName';
import { rarityInfo } from '@/lib/groups';
import { getSighting, sightingsOf, useJournal, type Sighting } from '@/store/journal';
import { duration, ease, groupColor, radius, space, usePalette } from '@/theme';

export default function Avistamiento() {
  const { id, nuevo } = useLocalSearchParams<{ id: string; nuevo?: string }>();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const removeSighting = useJournal((s) => s.removeSighting);
  const [s, setS] = useState<Sighting | null | undefined>(undefined);
  const [sp, setSp] = useState<SpeciesDetail | null>(null);
  const [firstOfSpecies, setFirstOfSpecies] = useState(false);
  const [breed, setBreed] = useState<Breed | null>(null);

  useEffect(() => {
    getSighting(id).then(async (row) => {
      setS(row);
      if (row?.species_id != null) {
        setSp(await getSpecies(row.species_id));
        if (row.breed_id) setBreed(await getBreed(row.breed_id));
        const all = await sightingsOf(row.species_id);
        setFirstOfSpecies(all.length === 1);
      }
    });
  }, [id]);

  // Revelación del cromo recién fichado: la pegatina se «despega» con un
  // fundido y una escala de 0,9 a 1 mientras un halo del color de su grupo se
  // abre detrás. Sin rebote; con «reducir movimiento» solo funde.
  const isNew = nuevo === '1';
  const reveal = useSharedValue(isNew && !reduced ? 0 : 1);
  useEffect(() => {
    if (isNew) reveal.set(withDelay(80, withTiming(1, { duration: duration.reveal, easing: ease.out })));
  }, [isNew, reveal]);
  const stickerReveal = useAnimatedStyle(() => ({
    opacity: Math.min(1, reveal.get() * 1.6),
    transform: [{ scale: 0.9 + 0.1 * reveal.get() }],
  }));
  const haloReveal = useAnimatedStyle(() => ({
    opacity: reveal.get(),
    transform: [{ scale: 0.55 + 0.45 * reveal.get() }],
  }));

  // Sello de «nueva especie»: entra con un leve giro y se asienta. Solo la
  // primera vez que se ficha esa especie (lo raro es lo que merece el gesto).
  const stamp = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (nuevo === '1' && firstOfSpecies) {
      stamp.set(withDelay(240, withTiming(1, { duration: duration.emphasis, easing: ease.out })));
    }
  }, [nuevo, firstOfSpecies, stamp]);
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.get(),
    transform: [{ rotate: `${-10 + 4 * stamp.get()}deg` }, { scale: reduced ? 1 : 1.12 - 0.12 * stamp.get() }],
  }));

  if (s === undefined) return <View style={[styles.fill, { backgroundColor: palette.bg }]} />;
  if (s === null) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: palette.bg }]}>
        <Txt variant="heading">Este avistamiento ya no existe</Txt>
        <Press onPress={() => router.back()} style={[styles.primary, { backgroundColor: palette.strong, marginTop: space.lg, paddingHorizontal: space.xl }]}>
          <Txt variant="bodyStrong" tone="onStrong">
            Volver
          </Txt>
        </Press>
      </View>
    );
  }

  const dn = sp ? displayName(sp) : null;
  const name = dn ? dn.name : 'Sin especie';
  const g = groupColor(sp?.grp);
  const foil = !!sp && sp.rarity >= 4;
  const stickerSize = Math.min(width - space.xl * 2, 360);

  const share = async () => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(s.sticker ?? s.photo, { dialogTitle: `Mi ${name} en Zarpa` });
    }
  };

  const remove = () =>
    Alert.alert('¿Despegar esta pegatina?', 'Se borra del cuaderno con su foto. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Despegar',
        style: 'destructive',
        onPress: async () => {
          await removeSighting(s.id);
          router.back();
        },
      },
    ]);

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl }}>
        <View style={styles.topBar}>
          <Press onPress={() => (nuevo ? router.replace('/cuaderno') : router.back())} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
            <Icon name={nuevo ? 'close' : 'back'} />
          </Press>
          <Press onPress={share} accessibilityLabel="Compartir la pegatina" style={[styles.round, { backgroundColor: palette.surface }]}>
            <Icon name="share" />
          </Press>
        </View>

        <View style={styles.stickerArea}>
          <Animated.View
            pointerEvents="none"
            style={[styles.halo, { width: stickerSize * 0.92, height: stickerSize * 0.92, borderRadius: stickerSize, backgroundColor: g.tint }, haloReveal]}
          />
          <Animated.View style={stickerReveal}>
            {s.sticker?.endsWith('.png') ? (
              <HoloSticker uri={s.sticker} size={stickerSize} foil={foil} />
            ) : (
              <Image source={s.sticker ?? s.photo} style={{ width: stickerSize, height: stickerSize, borderRadius: radius.lg }} contentFit="cover" />
            )}
          </Animated.View>
          {isNew && firstOfSpecies && (
            <Animated.View style={[styles.stamp, { borderColor: palette.red, backgroundColor: palette.surface }, stampStyle]}>
              <Txt variant="subheading" tone="red">
                ¡Especie nueva!
              </Txt>
            </Animated.View>
          )}
        </View>

        {isNew ? (
          <Appear delay={500} from="none" style={styles.pasted}>
            <View style={[styles.pastedPill, { backgroundColor: palette.leafTint }]}>
              <Icon name="check" size={18} color={palette.leaf} strokeWidth={2.4} />
              <Txt variant="label">
                Pegada en tu álbum
              </Txt>
            </View>
          </Appear>
        ) : null}

        <View style={styles.body}>
          <Txt
            variant={name.length > 22 ? 'title' : 'hero'}
            accessibilityRole="header"
            style={dn?.isSci ? { fontStyle: 'italic' } : undefined}>
            {name}
          </Txt>
          {sp && (
            <View style={styles.row}>
              <GroupPill code={sp.grp} />
              {dn && !dn.isSci ? (
                <Txt variant="sci" tone="soft" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {sp.sci}
                </Txt>
              ) : null}
              <TrailMark tier={sp.rarity} />
              <Txt variant="label" tone="soft">
                {rarityInfo(sp.rarity).label}
              </Txt>
            </View>
          )}

          <Card tone="outline" style={styles.label}>
            <Line k="Fecha" v={`${fmtDate(s.created_at)}, ${fmtTime(s.created_at)}`} />
            {breed ? <Line k="Raza (según tú)" v={breed.name} /> : null}
            {s.place ? <Line k="Lugar" v={s.place} /> : null}
            {s.lat != null && s.lng != null ? <Line k="Coordenadas" v={fmtCoords(s.lat, s.lng)} mono /> : null}
            <Line
              k="Identificación"
              v={
                s.verified
                  ? `Verificada por la IA (${fmt1((s.confidence ?? 0) * 100)} %)`
                  : s.method === 'ia'
                    ? 'Propuesta por la IA, sin llegar al umbral'
                    : 'Elegida a mano · sin verificar'
              }
            />
          </Card>

          <Txt variant="subheading" style={{ marginTop: space.xl, marginBottom: space.sm }}>
            Foto original
          </Txt>
          <Image source={s.photo} style={[styles.photo, { backgroundColor: palette.surfaceAlt }]} contentFit="cover" />

          <View style={styles.actions}>
            {sp && (
              <Press
                onPress={() => router.push({ pathname: '/especie/[id]', params: { id: String(sp.id) } })}
                style={[styles.primary, { backgroundColor: palette.brand }]}>
                <Txt variant="bodyStrong" tone="onBrand">
                  Ver la ficha de la especie
                </Txt>
              </Press>
            )}
            <Press onPress={remove} accessibilityLabel="Despegar esta pegatina del cuaderno" style={[styles.danger, { borderColor: palette.danger }]}>
              <Icon name="close" size={18} color={palette.danger} />
              <Txt variant="bodyStrong" tone="danger">
                Despegar del cuaderno
              </Txt>
            </Press>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Line({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={styles.line}>
      <Txt variant="data" tone="faint" style={styles.lineK}>
        {k}
      </Txt>
      <Txt variant={mono ? 'data' : 'body'} style={styles.lineV}>
        {v}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stickerArea: { alignItems: 'center', justifyContent: 'center', marginTop: space.lg },
  halo: { position: 'absolute' },
  pasted: { alignItems: 'center', marginTop: space.md },
  pastedPill: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill },
  stamp: { position: 'absolute', right: space.lg, top: space.md, borderWidth: 3, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.xs },
  body: { paddingHorizontal: space.lg, marginTop: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md, marginTop: space.sm },
  label: { marginTop: space.xl, gap: space.sm },
  line: { flexDirection: 'row', gap: space.md },
  lineK: { width: 104, paddingTop: 3 },
  lineV: { flex: 1 },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md },
  actions: { marginTop: space.xl, gap: space.sm },
  primary: { height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  danger: { height: 52, borderRadius: radius.pill, borderWidth: 1.5, flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center' },
});
