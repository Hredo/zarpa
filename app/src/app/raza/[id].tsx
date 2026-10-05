import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { countryNames } from '@/components/BreedLine';
import { Card } from '@/components/Card';
import { flagOf } from '@/components/ficha/flags';
import { Tag } from '@/components/ficha/Tag';
import { Icon, type IconName } from '@/components/Icon';
import { Appear } from '@/components/motion/Appear';
import { FadeImage } from '@/components/motion/FadeImage';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { getBreed, getSpecies, type Breed } from '@/db/catalog';
import { fmtDate } from '@/lib/format';
import { displayName } from '@/lib/speciesName';
import { AUTHORITY_LABEL } from '@/lib/groups';
import { expandUrl } from '@/lib/urls';
import { elevation, groupColor, radius, space, usePalette } from '@/theme';

const AUTHORITY_NAME: Record<string, string> = {
  fci: 'Federación Cinológica Internacional (FCI)',
  fife: 'Federación Internacional Felina (FIFe)',
  fao: 'FAO · Sistema de Información sobre la Diversidad de los Animales Domésticos (DAD-IS)',
  mapa: 'Ministerio de Agricultura, Pesca y Alimentación · Catálogo Oficial de Razas de Ganado de España',
};

/** Ficha de una raza: solo lo que publica su autoridad, con enlace a la fuente. */
export default function Raza() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [breed, setBreed] = useState<Breed | null | undefined>(undefined);
  const [speciesName, setSpeciesName] = useState<string | null>(null);
  const [grp, setGrp] = useState<string | null>(null);

  useEffect(() => {
    getBreed(id).then(async (b) => {
      setBreed(b);
      if (b) {
        const sp = await getSpecies(b.species_id);
        setSpeciesName(sp ? displayName(sp).name : null);
        setGrp(sp?.grp ?? null);
      }
    });
  }, [id]);

  if (breed === undefined) return <View style={[styles.fill, { backgroundColor: palette.bg }]} />;
  if (breed === null) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: palette.bg }]}>
        <Txt variant="heading">Esta raza no está en el catálogo</Txt>
        <Press onPress={() => router.back()} style={styles.textBtn}>
          <Txt variant="bodyStrong">Volver</Txt>
        </Press>
      </View>
    );
  }

  const g = groupColor(grp);
  const groupIcon: IconName = grp ? (grp as IconName) : 'heart';
  const photoW = width - space.lg * 2 - 12;
  const ratio = Math.min(1.6, Math.max(0.75, breed.img_ratio ?? 1.33));
  const photoH = Math.min(Math.round(photoW / ratio), 340);
  const others = (breed.names_other ?? '').split('|').filter(Boolean);
  const varieties = (breed.varieties ?? '').split('|').filter(Boolean);
  const origin = countryNames(breed.origin_cc, 6);
  const originFlags = (breed.origin_cc ?? '').split(',').filter(Boolean).slice(0, 6).map(flagOf).filter(Boolean);
  const facts: [string, string | null][] = [
    ['Grupo', breed.authority === 'fci' ? breed.grp : null],
    ['Sección', breed.section],
    ['Clasificación', breed.authority === 'fao' ? breed.grp : null],
    ['Código EMS', breed.authority === 'fife' ? breed.code : null],
    ['Número FCI', breed.authority === 'fci' ? breed.code : null],
    ['Reconocimiento', breed.status],
    ['Reconocida desde', breed.accepted ? fmtDate(breed.accepted) : null],
    ['País de origen', origin ?? breed.origin_text],
    ['Lugar de origen', breed.origin_place],
    ['Distribución', breed.distribution],
    ['Países con población registrada', breed.authority === 'fao' ? countryNames(breed.countries, 40) : null],
    ['Adaptación', breed.adapt],
    ['Estado de riesgo', breed.risk],
  ];
  const shown = facts.filter(([, v]) => v) as [string, string][];

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}>
        <View style={[styles.hero, { backgroundColor: g.tint, paddingTop: insets.top + space.sm }]}>
          <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }, elevation.card]}>
            <Icon name="back" size={22} color={palette.ink} />
          </Press>
          {breed.img ? (
            <Appear from="scale" style={[styles.photoWrap, { borderColor: palette.surface }, elevation.raised]}>
              <FadeImage
                source={expandUrl(breed.img)}
                style={{ width: photoW, height: photoH, borderRadius: radius.md }}
                contentFit="cover"
                placeholderColor={palette.surface}
                accessibilityLabel={`Fotografía de ${breed.name}`}
              />
            </Appear>
          ) : (
            <View style={styles.noPhoto}>
              <Icon name={groupIcon} size={72} color={g.color} strokeWidth={1.3} />
            </View>
          )}
          {breed.img ? (
            <Press onPress={() => breed.img_page && WebBrowser.openBrowserAsync(expandUrl(breed.img_page)!)} style={styles.credit}>
              <Icon name="camera" size={14} color={palette.inkFaint} />
              <Txt variant="small" tone="faint" numberOfLines={2} style={styles.flex}>
                {breed.img_author ?? 'Autor sin indicar'} · {breed.img_license ?? 'licencia libre'} · Wikimedia Commons
              </Txt>
            </Press>
          ) : null}
        </View>

        <View style={styles.content}>
          <Appear>
            <View style={styles.tags}>
              <Tag label={AUTHORITY_LABEL[breed.authority]} icon="check" color={g.color} tint={g.tint} ink={g.ink} />
              {speciesName ? <Tag label={speciesName} icon={grp ? groupIcon : undefined} color={g.color} tint={g.tint} ink={g.ink} /> : null}
            </View>
            <Txt variant={breed.name.length > 24 ? 'title' : 'hero'} upper style={styles.name}>
              {breed.name}
            </Txt>
            {originFlags.length > 0 ? (
              <Txt variant="title" style={styles.flags}>
                {originFlags.join(' ')}
              </Txt>
            ) : null}
            {breed.name_official && breed.name_official.toLowerCase() !== breed.name.toLowerCase() ? (
              <Txt variant="body" tone="soft">
                Nombre oficial: {breed.name_official}
              </Txt>
            ) : null}
            {others.length > 0 ? (
              <Txt variant="small" tone="faint" style={styles.others}>
                También: {others.slice(0, 12).join(' · ')}
              </Txt>
            ) : null}
          </Appear>

          {shown.length > 0 ? (
            <Appear index={1}>
              <Card style={styles.facts}>
                {shown.map(([label, value], i) => (
                  <View key={label} style={[styles.fact, i > 0 && { borderTopColor: palette.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <Txt variant="label" tone="soft" style={styles.factLabel}>
                      {label}
                    </Txt>
                    <Txt variant="body" style={styles.flex}>
                      {value}
                    </Txt>
                  </View>
                ))}
              </Card>
            </Appear>
          ) : null}

          {varieties.length > 0 ? (
            <Appear index={2}>
              <View style={styles.block}>
                <Txt variant="heading">Variedades reconocidas</Txt>
                <View style={styles.tags}>
                  {varieties.map((v) => (
                    <Tag key={v} label={v} tint={g.tint} ink={g.ink} />
                  ))}
                </View>
              </View>
            </Appear>
          ) : null}

          <View style={styles.actions}>
            <Press onPress={() => WebBrowser.openBrowserAsync(breed.url)} style={[styles.action, { backgroundColor: palette.strong }]}>
              <Icon name="external" size={18} color={palette.onStrong} />
              <Txt variant="label" tone="onStrong">
                Ver en la fuente oficial
              </Txt>
            </Press>
            {breed.standard_url ? (
              <Press
                onPress={() => WebBrowser.openBrowserAsync(breed.standard_url!)}
                style={[styles.action, { borderColor: palette.ink, borderWidth: 1.5 }]}>
                <Icon name="external" size={18} color={palette.ink} />
                <Txt variant="label">Estándar oficial (PDF)</Txt>
              </Press>
            ) : null}
          </View>

          <Txt variant="small" tone="faint" style={styles.source}>
            Fuente: {AUTHORITY_NAME[breed.authority]}
            {breed.retrieved ? `, consultada el ${fmtDate(breed.retrieved)}` : ''}.
            {breed.img ? ' Foto enlazada desde Wikidata.' : ''}
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  textBtn: { paddingVertical: space.md },
  hero: { paddingHorizontal: space.lg, paddingBottom: space.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, gap: space.md },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  photoWrap: { borderRadius: radius.lg, alignSelf: 'center', borderWidth: 6 },
  noPhoto: { alignItems: 'center', paddingVertical: space.xl },
  credit: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  name: { marginTop: space.md },
  flags: { marginTop: space.xs },
  others: { marginTop: space.xs },
  facts: { marginTop: space.xl, paddingVertical: space.xs },
  fact: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  factLabel: { width: 120 },
  block: { marginTop: space.xl, gap: space.md },
  actions: { marginTop: space.xl, gap: space.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.pill },
  source: { marginTop: space.xl },
});
