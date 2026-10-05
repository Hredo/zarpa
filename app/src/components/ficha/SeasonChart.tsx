import { StyleSheet, View } from 'react-native';

import { radius, space, usePalette, type GroupColor } from '@/theme';

import { Icon } from '../Icon';
import { Txt } from '../Txt';
import { GrowBar } from './GrowBar';

const MONTHS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function peakMonths(months: number[]): string | null {
  const total = months.reduce((a, b) => a + b, 0);
  if (total < 20) return null;
  const max = Math.max(...months);
  const top = months.map((v, i) => [v, i] as const).filter(([v]) => v >= max * 0.8).map(([, i]) => MONTHS_LONG[i]);
  if (top.length > 4) return null; // Todo el año por igual: no hay temporada que destacar.
  return top.length === 1 ? top[0] : `${top.slice(0, -1).join(', ')} y ${top[top.length - 1]}`;
}

/** Doce barras que crecen en cadena; los meses fuertes, en el color del grupo. */
export function MonthBars({ values, group }: { values: number[]; group: GroupColor }) {
  const palette = usePalette();
  const max = Math.max(1, ...values);
  const h = 84;
  return (
    <View>
      <View style={styles.cols}>
        {values.map((v, i) => {
          const strong = v >= max * 0.8 && v > 0;
          return (
            <View key={i} style={styles.col} accessible accessibilityLabel={`${MONTHS_LONG[i]}: ${v} avistamientos`}>
              <GrowBar value={v / max} height={h} color={group.color} opacity={strong ? 1 : 0.38} trackColor={palette.surfaceAlt} delay={i * 35} />
              <Txt variant="data" color={strong ? group.ink : palette.inkFaint} style={styles.lab}>
                {MONTHS[i]}
              </Txt>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Las 24 horas del día sobre una banda de día (tinte de sol) y de noche
 * (azul suave): se ve de un vistazo si el animal se deja ver de día o de noche.
 */
export function HourBars({ values, group }: { values: number[]; group: GroupColor }) {
  const palette = usePalette();
  const max = Math.max(1, ...values);
  const h = 56;
  const night = (i: number) => i < 6 || i >= 20;
  return (
    <View>
      <View style={styles.hours}>
        {values.map((v, i) => (
          <View key={i} style={[styles.hour, { backgroundColor: night(i) ? palette.strongTint : palette.sunTint }]}>
            <GrowBar value={v / max} height={h} color={group.color} delay={i * 18} />
          </View>
        ))}
      </View>
      <View style={styles.hourAxis}>
        <View style={styles.axisItem}>
          <Icon name="moon" size={14} color={palette.inkFaint} />
          <Txt variant="data" tone="faint">
            0 h
          </Txt>
        </View>
        <View style={styles.axisItem}>
          <Icon name="sun" size={14} color={palette.inkFaint} />
          <Txt variant="data" tone="faint">
            12 h
          </Txt>
        </View>
        <View style={styles.axisItem}>
          <Icon name="moon" size={14} color={palette.inkFaint} />
          <Txt variant="data" tone="faint">
            24 h
          </Txt>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: 'row', gap: 4 },
  col: { flex: 1 },
  lab: { textAlign: 'center', marginTop: 4, fontSize: 11 },
  hours: { flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden' },
  hour: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 0.5 },
  hourAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs + 2 },
  axisItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
