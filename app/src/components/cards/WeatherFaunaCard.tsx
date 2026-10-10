import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Cromo } from '@/components/Cromo';
import { Icon, type IconName } from '@/components/Icon';
import { AnimatedNumber } from '@/components/motion';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { fmtInt } from '@/lib/format';
import { placeName, type Coords } from '@/lib/location';
import { weatherInfo, WEATHER_CREDIT } from '@/lib/weather';
import { FAUNA_RADIUS_KM, weatherFauna, type WeatherFauna } from '@/lib/weatherFaunaRemote';
import { useJournal } from '@/store/journal';
import { HIT, radius, space, usePalette } from '@/theme';

type Props = {
  coords: Coords | null;
  /** Sin permiso de ubicación: botón para pedirlo. */
  noPerm: boolean;
  onAskLocation: () => void;
  onOpen: (id: number) => void;
  /** Margen lateral de la pantalla, para que la fila de cromos llegue al borde. */
  gutter: number;
};

/**
 * «El tiempo hoy» de Inicio: el clima de ahora donde está el usuario
 * (Open-Meteo) y, debajo, los animales vistos por la zona en esta época
 * (iNaturalist) a los que este tiempo les va bien, cada uno con el porqué
 * («Salen con la lluvia», «Toman el sol»). Ver lib/weatherFauna.ts.
 */
export function WeatherFaunaCard({ coords, noPerm, onAskLocation, onOpen, gutter }: Props) {
  const palette = usePalette();
  const key = coords ? `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}` : '';
  const [state, setState] = useState<{ key: string; data: WeatherFauna | null; place: string | null } | null>(null);

  useEffect(() => {
    if (!coords) return;
    let alive = true;
    Promise.all([weatherFauna(coords.lat, coords.lng, useJournal.getState().caught), placeName(coords)]).then(([data, place]) => {
      if (alive) setState({ key, data, place });
    });
    return () => {
      alive = false;
    };
    // Las coordenadas entran por `key`: moverse unos metros no repite la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!coords) {
    if (!noPerm) return null;
    return (
      <Card tone="tint" tint={palette.skyTint}>
        <Txt variant="subheading">¿Qué tiempo hace y qué sale con él?</Txt>
        <Txt variant="body" tone="soft" style={styles.mt}>
          Con tu ubicación te enseñamos el tiempo de ahora y los animales de tu zona a los que les va bien: con lluvia, anfibios y caracoles; con sol,
          reptiles y mariposas…
        </Txt>
        <Press onPress={onAskLocation} accessibilityRole="button" style={[styles.btn, { backgroundColor: palette.strong }]}>
          <Icon name="locate" size={20} color={palette.onStrong} />
          <Txt variant="bodyStrong" tone="onStrong">
            Usar mi ubicación
          </Txt>
        </Press>
      </Card>
    );
  }

  const loading = state?.key !== key;
  const data = loading ? null : state.data;
  if (loading) {
    return (
      <Card tone="outline">
        <Txt variant="body" tone="soft">
          Mirando el tiempo que hace…
        </Txt>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card tone="outline">
        <Txt variant="body" tone="soft">
          Sin conexión. El tiempo y los animales que salen con él aparecerán cuando vuelva la red.
        </Txt>
      </Card>
    );
  }

  const w = data.weather;
  const info = weatherInfo(w.code, w.isDay);
  const tint =
    info.icon === 'sun' ? palette.sunTint : info.icon === 'moon' ? palette.strongTint : ['rain', 'snow', 'storm'].includes(info.icon) ? palette.skyTint : palette.surfaceAlt;
  const iconColor = info.icon === 'sun' ? palette.brandInk : info.icon === 'moon' ? palette.strong : palette.sky;

  return (
    <View>
      <Card tone="tint" tint={tint} style={styles.card}>
        <View style={styles.top}>
          <View style={[styles.badge, { backgroundColor: palette.surface }]}>
            <Icon name={info.icon} size={32} color={iconColor} />
          </View>
          <View style={styles.flex}>
            <AnimatedNumber value={Math.round(w.tempC)} suffix=" °C" variant="title" />
            <Txt variant="bodyStrong">{info.label}</Txt>
            {state.place ? (
              <Txt variant="small" tone="soft" numberOfLines={1}>
                {state.place}
              </Txt>
            ) : null}
          </View>
        </View>
        <View style={styles.facts}>
          {w.feelsC != null ? <Fact icon="thermo" text={`Sensación ${fmtInt(Math.round(w.feelsC))} °C`} /> : null}
          {w.humidity != null ? <Fact icon="drop" text={`Humedad ${fmtInt(w.humidity)} %`} /> : null}
          {w.windKmh != null ? <Fact icon="wind" text={`Viento ${fmtInt(Math.round(w.windKmh))} km/h`} /> : null}
          {w.precipMm ? <Fact icon="rain" text={`Lluvia ${w.precipMm.toFixed(1).replace('.', ',')} mm`} /> : null}
        </View>
        <Txt variant="body">{data.hasSpecies ? data.headline : 'Sin conexión con iNaturalist: no sabemos qué se ve por aquí ahora.'}</Txt>
      </Card>

      {data.species.length > 0 ? (
        <View style={{ marginHorizontal: -gutter, marginTop: space.md }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.hscroll, { paddingHorizontal: gutter }]}>
            {data.species.map((s) => (
              <View key={s.id} style={styles.item}>
                <Cromo species={s} caught={false} width={152} onPress={onOpen} />
                <Txt variant="small" tone="soft" numberOfLines={2}>
                  {s.reason}
                </Txt>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <Txt variant="small" tone="faint" style={styles.credit}>
        {`Aún sin fichar · vistas a menos de ${FAUNA_RADIUS_KM} km en esta época (iNaturalist), ordenadas por lo bien que les va este tiempo. Es una orientación, no una garantía. ${WEATHER_CREDIT}.`}
      </Txt>
    </View>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const palette = usePalette();
  return (
    <View style={[styles.fact, { backgroundColor: palette.surface }]}>
      <Icon name={icon} size={16} color={palette.inkSoft} />
      <Txt variant="label">{text}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  flex: { flex: 1 },
  mt: { marginTop: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  badge: { width: 64, height: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.pill },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: HIT, paddingHorizontal: space.xl, borderRadius: radius.pill, alignSelf: 'flex-start', marginTop: space.md },
  hscroll: { gap: space.md, paddingBottom: space.sm },
  item: { width: 152, gap: space.xs },
  credit: { marginTop: space.sm },
});
