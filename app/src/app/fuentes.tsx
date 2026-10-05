import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Appear } from '@/components/motion';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { catalogMeta, getSources, type Source } from '@/db/catalog';
import { fmtDate, fmtInt } from '@/lib/format';
import { radius, space, usePalette } from '@/theme';

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

/** Enlace de la fuente: su URL si es fija; si es una plantilla por especie, la portada. */
function linkOf(s: Source): string | null {
  if (s.url && !s.url.includes('{')) return s.url;
  return LINKS[s.code] ?? null;
}

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
        <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
          <Icon name="back" />
        </Press>
        <Appear>
          <Txt variant="title" accessibilityRole="header" style={{ marginTop: space.lg }}>
            Fuentes y reglas
          </Txt>
          <Txt variant="body" tone="soft" style={{ marginTop: space.sm }}>
            De dónde sale cada dato de Zarpa y con qué reglas entra al catálogo.
          </Txt>
          {meta.built_at ? (
            <View style={[styles.stamp, { backgroundColor: palette.skyTint }]}>
              <Icon name="info" size={16} color={palette.sky} />
              <Txt variant="small" style={styles.fill}>
                Catálogo de {fmtInt(Number(meta.species ?? 0))} especies
                {meta.breeds ? ` y ${fmtInt(Number(meta.breeds))} razas` : ''} · generado el {fmtDate(meta.built_at)}
              </Txt>
            </View>
          ) : null}
        </Appear>

        <Section title="Qué animales entran" icon="eye" accent={palette.leaf} tint={palette.leafTint}>
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

        <Section title="Cómo se verifica cada dato" icon="check" accent={palette.sky} tint={palette.skyTint}>
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

        <Section title="Cómo vive y dónde" icon="tree" accent={palette.leaf} tint={palette.leafTint}>
          <Txt variant="body">
            Dieta, reproducción, actividad y hábitat salen de bases de datos científicas revisadas por pares: AVONET y
            EltonTraits para aves y mamíferos, ReptTraits para reptiles y AmphiBIO para anfibios. Cuando dos de ellas no
            coinciden en la dieta de un ave, no se muestra la categoría. Si vive en el mar, en agua dulce o en tierra lo
            dice WoRMS, el registro mundial de especies marinas, junto a esas bases.
          </Txt>
          <Txt variant="body" style={{ marginTop: space.md }}>
            «Ciudad» significa que la especie tiene al menos 10 observaciones humanas en GBIF, desde el año 2000, en los
            8 × 8 km del centro de alguna ciudad de más de un millón de habitantes (lista de GeoNames). «Granja», que tiene
            razas de ganado registradas por la FAO o el Ministerio de Agricultura. Los filtros solo abarcan las especies
            con el dato verificado.
          </Txt>
        </Section>

        <Section title="Razas" icon="heart" accent={palette.red} tint={palette.redTint}>
          <Txt variant="body">
            Solo razas reconocidas por su autoridad: la nomenclatura de la Federación Cinológica Internacional (FCI) para
            perros, con sus nombres oficiales en español; la Federación Internacional Felina (FIFe) para gatos; y para el
            ganado y las aves de corral, DAD-IS, la base de datos mundial de la FAO que alimenta cada país (en España, el
            Ministerio de Agricultura, cuyo catálogo oficial completa las razas autóctonas). Las extinguidas no aparecen.
          </Txt>
        </Section>

        <Section title="El reconocimiento" icon="sparkle" accent={palette.brandInk} tint={palette.brandTint}>
          <Txt variant="body">
            La IA corre en el móvil, sin enviar fotos a ningún servidor. Solo afirma la especie cuando su probabilidad
            supera el umbral con el que, en fotos verificadas que no vio al entrenarse, acierta al menos el 95 % de las
            veces. Si no llega, dice hasta dónde está segura (familia, género…) y te deja elegir; ese avistamiento queda
            como «sin verificar».
          </Txt>
          <Txt variant="body" style={{ marginTop: space.md }}>
            Ese 95 % se mide con fotos de todo el mundo y es una media. Según el grupo, al nombrar el orden, la familia o
            el género puede quedarse en el 85–90 %, sobre todo en peces, moluscos, anfibios y otros invertebrados, de los
            que el banco de pruebas tiene menos fotos. La raza no la propone la IA, porque no llega a ese nivel de acierto:
            la eliges tú.
          </Txt>
        </Section>

        <Section title="Fuentes del catálogo" icon="layers" accent={palette.ink} tint={palette.strongTint}>
          <Card tone="outline" padding={0} style={styles.sources}>
            {sources.map((s, i) => (
              <Press
                key={s.code}
                disabled={!linkOf(s)}
                scaleTo={1}
                accessibilityRole={linkOf(s) ? 'link' : 'text'}
                accessibilityLabel={linkOf(s) ? `${s.label}. Abrir su web` : s.label}
                onPress={() => linkOf(s) && WebBrowser.openBrowserAsync(linkOf(s)!)}
                style={[styles.source, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line }]}>
                <View style={styles.fill}>
                  <Txt variant="bodyStrong">{s.label}</Txt>
                  {s.license ? (
                    <Txt variant="small" tone="faint">
                      {s.license}
                    </Txt>
                  ) : null}
                </View>
                {linkOf(s) ? <Icon name="external" size={18} color={palette.sky} /> : null}
              </Press>
            ))}
          </Card>
        </Section>

        <Section title="Mapas" icon="globe" accent={palette.sky} tint={palette.skyTint}>
          <Txt variant="body">
            Mapa base © OpenStreetMap y colaboradores, teselas de OpenFreeMap. Relieve: Mapzen Terrain Tiles (AWS Open
            Data). Observaciones: GBIF.org. Lugares administrativos: GADM, a través de GBIF. Grandes ciudades: GeoNames
            (CC BY 4.0). Bosques, parques y espacios protegidos: © colaboradores de OpenStreetMap (ODbL), vía Overpass.
          </Txt>
        </Section>

        <Section title="Imágenes y textos" icon="image" accent={palette.brandInk} tint={palette.brandTint}>
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
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg, padding: space.md, borderRadius: radius.md },
  sources: { overflow: 'hidden' },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.md, paddingHorizontal: space.lg },
});
