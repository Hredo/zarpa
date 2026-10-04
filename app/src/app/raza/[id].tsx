import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { countryNames } from '@/components/BreedLine';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { getBreed, getSpecies, type Breed } from '@/db/catalog';
import { fmtDate } from '@/lib/format';
import { AUTHORITY_LABEL } from '@/lib/groups';
import { expandUrl } from '@/lib/urls';
import { radius, space, usePalette } from '@/theme';

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

  useEffect(() => {
    getBreed(id).then(async (b) => {
      setBreed(b);
      if (b) {
        const sp = await getSpecies(b.species_id);
        setSpeciesName(sp ? (sp.name_es ?? sp.sci) : null);
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

  const imgH = breed.img ? Math.round(width / Math.min(1.6, Math.max(0.75, breed.img_ratio ?? 1.33))) : 0;
  const others = (breed.names_other ?? '').split('|').filter(Boolean);
  const varieties = (breed.varieties ?? '').split('|').filter(Boolean);
  const origin = countryNames(breed.origin_cc, 6);
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

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}>
        {breed.img ? (
          <>
            <Image source={expandUrl(breed.img)} style={{ width, height: imgH }} contentFit="cover" transition={200} accessibilityLabel={`Fotografía de ${breed.name}`} />
            <Press
              onPress={() => breed.img_page && WebBrowser.openBrowserAsync(expandUrl(breed.img_page)!)}
              style={[styles.credit, { borderBottomColor: palette.line }]}>
              <Txt variant="small" tone="faint" numberOfLines={2}>
                Foto: {breed.img_author ?? 'autor sin indicar'} · {breed.img_license ?? 'licencia libre'} · Wikimedia Commons
              </Txt>
            </Press>
          </>
        ) : null}
        <View style={[styles.topBar, { top: (breed.img ? 0 : insets.top) + space.sm }]}>
          <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: breed.img ? 'rgba(8,14,10,0.55)' : palette.surfaceAlt }]}>
            <Icon name="back" size={22} color={breed.img ? '#FFFFFF' : palette.ink} />
          </Press>
        </View>

        <View style={[styles.content, !breed.img && { paddingTop: insets.top + 64 }]}>
          <Txt variant="data" tone="faint">
            {AUTHORITY_LABEL[breed.authority]}
            {speciesName ? ` · ${speciesName}` : ''}
          </Txt>
          <Txt variant={breed.name.length > 24 ? 'title' : 'hero'} upper style={styles.name}>
            {breed.name}
          </Txt>
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

          <View style={styles.facts}>
            {facts
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <View key={label} style={[styles.fact, { borderBottomColor: palette.line }]}>
                  <Txt variant="label" tone="soft" style={styles.factLabel}>
                    {label}
                  </Txt>
                  <Txt variant="body" style={styles.factValue}>
                    {value}
                  </Txt>
                </View>
              ))}
          </View>

          {varieties.length > 0 ? (
            <View style={styles.block}>
              <Txt variant="subheading">Variedades reconocidas</Txt>
              {varieties.map((v) => (
                <Txt key={v} variant="body">
                  {v}
                </Txt>
              ))}
            </View>
          ) : null}

          <View style={styles.actions}>
            <Press
              onPress={() => WebBrowser.openBrowserAsync(breed.url)}
              style={[styles.action, { borderColor: palette.ink }]}>
              <Icon name="external" size={18} color={palette.ink} />
              <Txt variant="label">Ver en la fuente oficial</Txt>
            </Press>
            {breed.standard_url ? (
              <Press
                onPress={() => WebBrowser.openBrowserAsync(breed.standard_url!)}
                style={[styles.action, { borderColor: palette.ink }]}>
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
  center: { alignItems: 'center', justifyContent: 'center' },
  textBtn: { paddingVertical: space.md },
  credit: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  topBar: { position: 'absolute', left: space.lg },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg },
  name: { marginTop: space.xs },
  others: { marginTop: space.xs },
  facts: { marginTop: space.xl },
  fact: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  factLabel: { width: 128 },
  factValue: { flex: 1 },
  block: { marginTop: space.xl, gap: space.xs },
  actions: { marginTop: space.xl, gap: space.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1.5 },
  source: { marginTop: space.xl },
});
