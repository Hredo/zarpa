import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { catalogMeta, getSources, type Source } from '@/db/catalog';
import { fmtDate, fmtInt } from '@/lib/format';
import { space, usePalette } from '@/theme';

const LINKS: Record<string, string> = {
  inat: 'https://www.inaturalist.org',
  gbif: 'https://www.gbif.org',
  'gbif-occ': 'https://www.gbif.org/occurrence/search',
  wikidata: 'https://www.wikidata.org',
  iucn: 'https://www.iucnredlist.org',
  commons: 'https://commons.wikimedia.org',
  'wikipedia-es': 'https://es.wikipedia.org',
  'wikipedia-en': 'https://en.wikipedia.org',
  worms: 'https://www.marinespecies.org',
};

/*
 * De dónde sale cada dato y con qué reglas entra. Es la pantalla que responde
 * a «¿y esto quién lo dice?», y también la que cumple las licencias (atribución
 * de GBIF, Wikipedia, Commons, iNaturalist, OpenFreeMap…).
 */
export default function Fuentes() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [sources, setSources] = useState<Source[]>([]);
  const [meta, setMeta] = useState<Record<string, string>>({});

  useEffect(() => {
    getSources().then(setSources);
    catalogMeta().then(setMeta);
  }, []);

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.lg }}>
        <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { borderColor: palette.line }]}>
          <Icon name="back" />
        </Press>
        <Txt variant="title" style={{ marginTop: space.lg }}>
          Fuentes y reglas
        </Txt>
        {meta.built_at ? (
          <Txt variant="data" tone="faint" style={{ marginTop: space.xs }}>
            Catálogo de {fmtInt(Number(meta.species ?? 0))} especies · generado el {fmtDate(meta.built_at)}
          </Txt>
        ) : null}

        <Section title="Qué animales entran">
          <Txt variant="body">
            Solo especies que personas han fotografiado en libertad y cuya identificación ha confirmado la comunidad de
            iNaturalist (grado «investigación») al menos {meta.min_rg_observations ?? 25} veces. Es la prueba de que se
            pueden ver sin submarinos, sin drones y sin entrar en cuevas cerradas al público.
          </Txt>
          <Txt variant="body" style={{ marginTop: space.md }}>
            Además, el nombre científico tiene que existir también en la taxonomía de referencia de GBIF (construida
            sobre el Catalogue of Life). Dos autoridades independientes, o fuera.
          </Txt>
        </Section>

        <Section title="Cómo se verifica cada dato">
          <Txt variant="body">
            Cada dato viene de la autoridad de ese dato o de dos fuentes que coinciden. Si no se cumple, no se muestra:
            la ficha deja el hueco en vez de rellenarlo con una suposición. Por ejemplo, la categoría de amenaza solo
            aparece si la copia de la Lista Roja que publica iNaturalist y la de Wikidata coinciden.
          </Txt>
          <Txt variant="body" style={{ marginTop: space.md }}>
            La rareza de avistamiento mide cuántas veces se ha visto la especie, no si está amenazada. La amenaza la da
            la UICN, aparte.
          </Txt>
        </Section>

        <Section title="El reconocimiento">
          <Txt variant="body">
            La IA corre en el móvil, sin enviar fotos a ningún servidor. Solo afirma la especie cuando su probabilidad
            supera el umbral con el que, en fotos verificadas que no vio al entrenarse, acierta al menos el 95 % de las
            veces. Si no llega, dice hasta dónde está segura (familia, género…) y te deja elegir; ese avistamiento queda
            como «sin verificar».
          </Txt>
        </Section>

        <Section title="Fuentes del catálogo">
          {sources.map((s) => (
            <Press
              key={s.code}
              onPress={() => LINKS[s.code] && WebBrowser.openBrowserAsync(LINKS[s.code])}
              style={[styles.source, { borderBottomColor: palette.line }]}>
              <View style={styles.fill}>
                <Txt variant="bodyStrong">{s.label}</Txt>
                {s.license ? (
                  <Txt variant="small" tone="faint">
                    {s.license}
                  </Txt>
                ) : null}
              </View>
              <Icon name="external" size={18} color={palette.inkFaint} />
            </Press>
          ))}
        </Section>

        <Section title="Mapas">
          <Txt variant="body">
            Mapa base © OpenStreetMap y colaboradores, teselas de OpenFreeMap. Relieve: Mapzen Terrain Tiles (AWS Open
            Data). Observaciones: GBIF.org. Lugares administrativos: GADM, a través de GBIF.
          </Txt>
        </Section>

        <Section title="Imágenes y textos">
          <Txt variant="body">
            Las fotos son de Wikimedia Commons o de iNaturalist, solo con licencias libres (CC0, CC BY, CC BY-SA), y
            cada una muestra su autor y licencia. Los resúmenes son de Wikipedia (CC BY-SA 4.0) y enlazan a su artículo.
          </Txt>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
