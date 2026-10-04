import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoloSticker } from '@/components/HoloSticker';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { TrailMark } from '@/components/TrailMark';
import { Txt } from '@/components/Txt';
import { getBreed, getSpecies, type Breed, type SpeciesDetail } from '@/db/catalog';
import { fmt1, fmtCoords, fmtDate, fmtTime } from '@/lib/format';
import { rarityInfo } from '@/lib/groups';
import { getSighting, sightingsOf, useJournal, type Sighting } from '@/store/journal';
import { duration, ease, radius, space, usePalette } from '@/theme';

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
    transform: [{ rotate: `${-14 + 4 * stamp.get()}deg` }, { scale: 1.15 - 0.15 * stamp.get() }],
  }));

  if (s === undefined) return <View style={[styles.fill, { backgroundColor: palette.bg }]} />;
  if (s === null) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: palette.bg }]}>
        <Txt variant="heading">Este avistamiento ya no existe</Txt>
        <Press onPress={() => router.back()} style={{ padding: space.lg }}>
          <Txt variant="bodyStrong">Volver</Txt>
        </Press>
      </View>
    );
  }

  const name = sp ? (sp.name_es ?? sp.name_en ?? sp.sci) : 'Sin especie';
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
          <Press onPress={() => (nuevo ? router.replace('/cuaderno') : router.back())} accessibilityLabel="Volver" style={[styles.round, { borderColor: palette.line }]}>
            <Icon name={nuevo ? 'close' : 'back'} />
          </Press>
          <Press onPress={share} accessibilityLabel="Compartir la pegatina" style={[styles.round, { borderColor: palette.line }]}>
            <Icon name="share" />
          </Press>
        </View>

        <View style={styles.stickerArea}>
          {s.sticker?.endsWith('.png') ? (
            <HoloSticker uri={s.sticker} size={stickerSize} foil={foil} />
          ) : (
            <Image source={s.sticker ?? s.photo} style={{ width: stickerSize, height: stickerSize, borderRadius: radius.lg }} contentFit="cover" />
          )}
          {nuevo === '1' && firstOfSpecies && (
            <Animated.View style={[styles.stamp, { borderColor: palette.trailRed }, stampStyle]}>
              <Txt variant="subheading" tone="trailRed" upper>
                Nueva especie
              </Txt>
            </Animated.View>
          )}
        </View>

        <View style={styles.body}>
          <Txt variant={name.length > 22 ? 'title' : 'hero'}>{name}</Txt>
          {sp && (
            <View style={styles.row}>
              <Txt variant="sci" tone="soft">
                {sp.sci}
              </Txt>
              <TrailMark tier={sp.rarity} />
              <Txt variant="label" tone="soft">
                {rarityInfo(sp.rarity).label}
              </Txt>
            </View>
          )}

          <View style={[styles.label, { backgroundColor: palette.surface, borderColor: palette.line }]}>
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
          </View>

          <Txt variant="label" tone="faint" style={{ marginTop: space.xl, marginBottom: space.sm }}>
            Foto original
          </Txt>
          <Image source={s.photo} style={[styles.photo, { backgroundColor: palette.surfaceAlt }]} contentFit="cover" />

          <View style={styles.actions}>
            {sp && (
              <Press
                onPress={() => router.push({ pathname: '/especie/[id]', params: { id: String(sp.id) } })}
                style={[styles.primary, { backgroundColor: palette.forest }]}>
                <Txt variant="bodyStrong" tone="onForest">
                  Ver la ficha
                </Txt>
              </Press>
            )}
            <Press onPress={remove} style={styles.danger}>
              <Txt variant="bodyStrong" tone="danger">
                Despegar
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
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stickerArea: { alignItems: 'center', marginTop: space.lg },
  stamp: { position: 'absolute', right: space.xl, top: space.md, borderWidth: 3, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.xs },
  body: { paddingHorizontal: space.lg, marginTop: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xs },
  label: { marginTop: space.xl, borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  line: { flexDirection: 'row', gap: space.md },
  lineK: { width: 104, paddingTop: 3 },
  lineV: { flex: 1 },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md },
  actions: { marginTop: space.xl, gap: space.sm },
  primary: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  danger: { height: 48, alignItems: 'center', justifyContent: 'center' },
});
