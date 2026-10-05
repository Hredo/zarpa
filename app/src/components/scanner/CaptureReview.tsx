import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Verdict } from '@/ai/decision';
import { judgeBreed, speciesModelId, type BreedGuess } from '@/ai/engine';
import { getSpeciesByIds, listSpecies, type BreedRow, type SpeciesRow } from '@/db/catalog';
import { EMPTY_FILTERS } from '@/db/query';
import type { CaptureResult } from '@/lib/capture';
import { displayName } from '@/lib/speciesName';
import { discardCapture } from '@/lib/capture';
import { fmt1 } from '@/lib/format';
import { countryOf, placeName, type Coords } from '@/lib/location';
import { useJournal } from '@/store/journal';
import { duration, ease, radius, space, type, usePalette } from '@/theme';

import { listThumb } from '../Cromo';
import { BreedPicker } from './BreedPicker';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { TrailMark } from '../TrailMark';
import { Txt } from '../Txt';

type Props = {
  capture: CaptureResult;
  coords: Coords | null;
  candidates: number[] | undefined;
  onRetry: () => void;
};

const LEVEL_ES: Record<string, string> = {
  class: 'la clase',
  order: 'el orden',
  family: 'la familia',
  genus: 'el género',
};

/*
 * Revisión del disparo.
 *
 * Es la revelación del cromo: un halo mandarina se abre detrás de la pegatina
 * mientras esta entra con escala de 0,9 a 1, giro leve y opacidad, todo en
 * curva de salida (es el «despegar» del papel). Al fichar, se encoge hacia la
 * esquina del cuaderno. Nada rebota. Con «reducir movimiento» solo hay fundido.
 *
 * Lo que se afirma depende del veredicto:
 *   - especie fijada → «Es un …», se ficha como verificado;
 *   - solo hasta género/familia/orden → se dice hasta dónde y se ofrecen las
 *     candidatas para que el usuario elija: queda como NO verificado;
 *   - nada → se ofrece buscar la especie a mano: NO verificado.
 */
export function CaptureReview({ capture, coords, candidates, onRetry }: Props) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const addSighting = useJournal((s) => s.addSighting);
  const [top, setTop] = useState<SpeciesRow[]>([]);
  const [chosen, setChosen] = useState<number | null>(capture.verdict?.speciesId ?? null);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SpeciesRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [breed, setBreed] = useState<BreedRow | null>(null);
  const [cc, setCc] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<{ species: number | null; top: BreedGuess[]; sure: number | null }>({
    species: null,
    top: [],
    sure: null,
  });

  // Raza: solo si la IA tiene retratos de las razas de la especie elegida.
  useEffect(() => {
    if (!chosen || !capture.embedding) return;
    let alive = true;
    judgeBreed(capture.embedding, chosen).then((g) => {
      if (alive) setGuesses({ species: chosen, top: g?.top ?? [], sure: g?.sure?.rid ?? null });
    });
    return () => {
      alive = false;
    };
  }, [chosen, capture.embedding]);

  useEffect(() => {
    if (coords) countryOf(coords).then(setCc);
  }, [coords]);

  const verdict: Verdict | null = capture.verdict;
  const probOf = useMemo(() => new Map((verdict?.top ?? []).map((c) => [c.id, c.p])), [verdict]);

  useEffect(() => {
    const ids = (verdict?.top ?? []).map((c) => c.id);
    getSpeciesByIds(ids).then((rows) => setTop(ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as SpeciesRow[]));
  }, [verdict]);

  useEffect(() => {
    if (!searching || q.trim().length < 2) return;
    const t = setTimeout(() => {
      listSpecies({ ...EMPTY_FILTERS, q }, { caughtIds: [], savedIds: [] }, 'popular', 30, 0).then((rows) => {
        // Las que se ven en tu país primero: es más probable que sea una de ellas.
        const local = new Set(candidates ?? []);
        setResults([...rows].sort((a, b) => Number(local.has(b.id)) - Number(local.has(a.id))));
      });
    }, 160);
    return () => clearTimeout(t);
  }, [q, searching, candidates]);

  const enter = useSharedValue(reduced ? 1 : 0);
  const leave = useSharedValue(0);
  useEffect(() => {
    enter.set(withTiming(1, { duration: duration.emphasis, easing: ease.out }));
  }, [enter]);
  const stickerStyle = useAnimatedStyle(() => ({
    opacity: enter.get() * (1 - leave.get()),
    transform: [
      { translateX: leave.get() * 120 },
      { translateY: leave.get() * 340 },
      { scale: (reduced ? 1 : 0.9 + 0.1 * enter.get()) * (1 - 0.7 * leave.get()) },
      { rotate: reduced ? '0deg' : `${-4 + 4 * enter.get() - 8 * leave.get()}deg` },
    ],
  }));
  // El halo se abre un poco más despacio que la pegatina y se queda como luz de fondo.
  const halo = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    halo.set(withDelay(120, withTiming(1, { duration: duration.reveal, easing: ease.out })));
  }, [halo]);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.get() * 0.42 * (1 - leave.get()),
    transform: [{ scale: reduced ? 1 : 0.6 + 0.4 * halo.get() }],
  }));

  const shownResults = searching && q.trim().length >= 2 ? results : [];
  const chosenRow = top.find((r) => r.id === chosen) ?? results.find((r) => r.id === chosen) ?? null;
  const verified = !!verdict?.speciesId && chosen === verdict.speciesId;

  const save = async () => {
    if (!chosen || saving) return;
    setSaving(true);
    const place = coords ? await placeName(coords) : null;
    const row = await addSighting({
      species_id: chosen,
      // La raza solo cuenta si es de la especie elegida.
      breed_id: breed && breed.species_id === chosen ? breed.id : null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      accuracy: coords?.accuracy ?? null,
      place,
      photo: capture.photoUri,
      sticker: capture.stickerUri ?? capture.cropUri,
      method: verified ? 'ia' : 'manual',
      confidence: probOf.get(chosen) ?? null,
      candidates: verdict ? JSON.stringify(verdict.top) : null,
      verified,
      model: speciesModelId(),
      note: null,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    leave.set(withTiming(1, { duration: duration.emphasis, easing: ease.inOut }));
    setTimeout(
      () => router.replace({ pathname: '/avistamiento/[id]', params: { id: row.id, nuevo: '1' } }),
      reduced ? 0 : duration.emphasis + 60,
    );
  };

  const discard = () => {
    discardCapture(capture);
    router.back();
  };

  const headline = (() => {
    if (verified && chosenRow) return displayName(chosenRow).name;
    if (verdict?.level && verdict.level !== 'species' && verdict.taxon) return `Es de ${LEVEL_ES[verdict.level]} ${verdict.taxon}`;
    return 'Necesito tu ayuda';
  })();

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.strongDeep }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.stickerWrap}>
          <Animated.View pointerEvents="none" style={[styles.halo, { backgroundColor: palette.brand }, haloStyle]} />
          <Animated.View style={stickerStyle}>
            <Image source={capture.stickerUri ?? capture.cropUri} style={styles.sticker} contentFit="contain" />
          </Animated.View>
        </View>

        <View style={styles.body}>
          <Txt
            variant="title"
            tone="onStrong"
            style={verified && chosenRow && displayName(chosenRow).isSci ? { fontStyle: 'italic' } : undefined}>
            {headline}
          </Txt>
          {verified && chosenRow ? (
            <View style={styles.row}>
              <Txt variant="sci" tone="onStrongSoft" numberOfLines={1} style={{ flexShrink: 1 }}>
                {displayName(chosenRow).isSci ? displayName(chosenRow).sub : chosenRow.sci}
              </Txt>
              <TrailMark tier={chosenRow.rarity} />
            </View>
          ) : null}
          <Txt variant="small" tone="onStrongSoft" style={{ marginTop: space.sm }}>
            {verified
              ? `La IA la reconoce con un ${fmt1((probOf.get(chosen!) ?? 0) * 100)} % de probabilidad, por encima del umbral con el que acierta el 95 % de las veces.`
              : verdict?.level && verdict.level !== 'species'
                ? 'La IA no está lo bastante segura para decir la especie. Elige la que creas entre las candidatas: quedará como «sin verificar».'
                : verdict
                  ? 'La IA no ha podido reconocerlo con seguridad. Si sabes qué es, búscalo abajo: quedará como «sin verificar».'
                  : 'Este móvil aún no tiene el reconocimiento de especies. Elige tú la especie: quedará como «sin verificar».'}
          </Txt>

          {top.length > 0 && (
            <View style={{ marginTop: space.lg, gap: space.sm }}>
              <Txt variant="label" tone="onStrongSoft">
                Candidatas de la IA
              </Txt>
              {top.map((s) => (
                <Option
                  key={s.id}
                  species={s}
                  p={probOf.get(s.id) ?? null}
                  selected={chosen === s.id}
                  onPress={() => setChosen(s.id)}
                />
              ))}
            </View>
          )}

          {chosen ? (
            <BreedPicker
              speciesId={chosen}
              cc={cc}
              value={breed && breed.species_id === chosen ? breed : null}
              onChange={setBreed}
              guesses={guesses.species === chosen ? guesses.top : []}
              sureRid={guesses.species === chosen ? guesses.sure : null}
            />
          ) : null}

          {searching ? (
            <View style={{ marginTop: space.lg, gap: space.sm }}>
              <View style={[styles.search, { backgroundColor: palette.surface }]}>
                <Icon name="search" size={20} color={palette.inkFaint} />
                <TextInput
                  autoFocus
                  value={q}
                  onChangeText={setQ}
                  placeholder="Busca la especie"
                  placeholderTextColor={palette.inkFaint}
                  style={[type.body, styles.input, { color: palette.ink }]}
                />
              </View>
              {shownResults.map((s) => (
                <Option key={s.id} species={s} p={null} selected={chosen === s.id} onPress={() => setChosen(s.id)} />
              ))}
            </View>
          ) : (
            <Press onPress={() => setSearching(true)} style={styles.linkBtn}>
              <Icon name="search" size={18} color={palette.onStrong} />
              <Txt variant="bodyStrong" tone="onStrong">
                Buscar otra especie
              </Txt>
            </Press>
          )}

          <Press
            haptic
            disabled={!chosen || saving}
            onPress={save}
            style={[
              styles.primary,
              { backgroundColor: chosen ? palette.brand : 'rgba(255, 255, 255, 0.18)' },
            ]}>
            <Txt variant="bodyStrong" tone={chosen ? 'onBrand' : 'onStrongSoft'}>
              {saving ? 'Pegando en tu álbum…' : verified ? 'Fichar en mi cuaderno' : 'Guardar como sin verificar'}
            </Txt>
          </Press>
          <View style={styles.secondaryRow}>
            <Press onPress={onRetry} style={styles.secondary}>
              <Txt variant="bodyStrong" tone="onStrong">
                Repetir la foto
              </Txt>
            </Press>
            <Press onPress={discard} style={styles.secondary}>
              <Txt variant="bodyStrong" tone="onStrongSoft">
                Descartar
              </Txt>
            </Press>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Option({ species, p, selected, onPress }: { species: SpeciesRow; p: number | null; selected: boolean; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Press
      onPress={onPress}
      accessibilityState={{ selected }}
      style={[
        styles.option,
        {
          backgroundColor: selected ? palette.surface : 'rgba(255,255,255,0.06)',
          borderColor: selected ? palette.brand : 'rgba(255,255,255,0.16)',
        },
      ]}>
      <Image source={listThumb(species.img)} style={styles.optionImg} contentFit="cover" />
      <View style={styles.fill}>
        <Txt
          variant="bodyStrong"
          tone={selected ? 'ink' : 'onStrong'}
          numberOfLines={1}
          style={displayName(species).isSci ? { fontStyle: 'italic' } : undefined}>
          {displayName(species).name}
        </Txt>
        <Txt variant="sci" tone={selected ? 'soft' : 'onStrongSoft'} numberOfLines={1}>
          {displayName(species).isSci ? displayName(species).sub : `${species.sci} · ${displayName(species).group}`}
        </Txt>
      </View>
      {p !== null && (
        <Txt variant="data" tone={selected ? 'ink' : 'onStrongSoft'}>
          {fmt1(p * 100)} %
        </Txt>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stickerWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  halo: { position: 'absolute', width: 300, height: 300, borderRadius: 150 },
  sticker: { width: '100%', aspectRatio: 1, maxHeight: 340 },
  body: { paddingHorizontal: space.lg, marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xs },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.md, borderWidth: 1.5 },
  optionImg: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.1)' },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, paddingHorizontal: space.md, borderRadius: radius.md },
  input: { flex: 1, paddingVertical: 0 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  primary: { marginTop: space.lg, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  secondary: { padding: space.md },
});
