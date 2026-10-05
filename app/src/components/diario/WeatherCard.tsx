import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { AnimatedNumber } from '@/components/motion';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { fmtInt } from '@/lib/format';
import { dayPhaseOfHour, isDaylight, PHASES } from '@/lib/dayPhase';
import { weatherInfo, WEATHER_CREDIT, type Weather } from '@/lib/weather';
import { radius, space, usePalette } from '@/theme';

type Props = {
  weather: Weather | null;
  /** Fase del día guardada o deducida de la hora del avistamiento. */
  phase: string;
  /** Hora local del avistamiento, para el rótulo («09:41»). */
  timeLabel: string;
  /** Solo si el avistamiento es reciente y tiene ubicación: pedir el clima ahora. */
  onFetch?: () => void;
  fetching?: boolean;
};

/**
 * Tarjeta del clima en el momento del avistamiento: temperatura grande (cuenta
 * al abrirse), estado del cielo con su icono y, debajo, sensación, humedad y
 * viento. El fondo cambia con el cielo (sol, noche, lluvia). Si no hay clima
 * (sin red al fichar) lo dice, sin inventar nada.
 */
export function WeatherCard({ weather, phase, timeLabel, onFetch, fetching }: Props) {
  const palette = usePalette();
  const phaseInfo = PHASES.find((p) => p.code === phase) ?? PHASES[1];
  const day = weather ? weather.isDay : isDaylight(dayPhaseOfHour(phaseInfo.from));
  const info = weather ? weatherInfo(weather.code, weather.isDay) : null;
  const tint = !info
    ? palette.surfaceAlt
    : info.icon === 'sun'
      ? palette.sunTint
      : info.icon === 'moon'
        ? palette.strongTint
        : info.icon === 'rain' || info.icon === 'snow' || info.icon === 'storm'
          ? palette.skyTint
          : palette.surfaceAlt;
  const iconColor = info?.icon === 'sun' ? palette.brandInk : info?.icon === 'moon' ? palette.strong : palette.sky;

  return (
    <Card tone="tint" tint={tint} style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: palette.surface }]}>
          <Icon name={info ? info.icon : day ? 'sun' : 'moon'} size={32} color={info ? iconColor : palette.inkFaint} />
        </View>
        <View style={styles.flex}>
          {weather && info ? (
            <>
              <AnimatedNumber value={Math.round(weather.tempC)} suffix=" °C" variant="title" />
              <Txt variant="bodyStrong">{info.label}</Txt>
            </>
          ) : (
            <>
              <Txt variant="subheading">Sin datos del clima</Txt>
              <Txt variant="small" tone="soft">
                No había conexión al fichar este avistamiento.
              </Txt>
            </>
          )}
        </View>
      </View>

      <View style={styles.facts}>
        <Fact icon={day ? 'sun' : 'moon'} text={`${phaseInfo.label} · ${timeLabel}`} />
        {weather?.feelsC != null ? <Fact icon="thermo" text={`Sensación ${fmtInt(Math.round(weather.feelsC))} °C`} /> : null}
        {weather?.humidity != null ? <Fact icon="drop" text={`Humedad ${fmtInt(weather.humidity)} %`} /> : null}
        {weather?.windKmh != null ? <Fact icon="wind" text={`Viento ${fmtInt(Math.round(weather.windKmh))} km/h`} /> : null}
      </View>

      {!weather && onFetch ? (
        <Press onPress={onFetch} disabled={fetching} accessibilityRole="button" style={[styles.fetch, { backgroundColor: palette.surface }]}>
          <Icon name="download" size={18} color={palette.sky} />
          <Txt variant="bodyStrong" tone="sky">
            {fetching ? 'Consultando…' : 'Consultar el clima de ahora'}
          </Txt>
        </Press>
      ) : null}
      {weather ? (
        <Txt variant="small" tone="faint">
          {WEATHER_CREDIT}
        </Txt>
      ) : null}
    </Card>
  );
}

function Fact({ icon, text }: { icon: 'sun' | 'moon' | 'thermo' | 'drop' | 'wind'; text: string }) {
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
  top: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  badge: { width: 64, height: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.pill },
  fetch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 48, borderRadius: radius.pill },
});
