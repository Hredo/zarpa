import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { rarityInfo } from '@/lib/groups';
import { usePalette } from '@/theme';

/*
 * Marca de sendero: dos franjas pintadas, blanca arriba y de color abajo, como
 * las de los caminos señalizados de España. Codifica la rareza de avistamiento:
 *
 *   común       blanco sobre blanco (sin color: el animal de todos los días)
 *   frecuente   blanco y verde (SL, sendero local)
 *   escasa      blanco y amarillo (PR, pequeño recorrido)
 *   rara        blanco y rojo (GR, gran recorrido)
 *   legendaria  blanco e iridiscente (no existe en el monte: por eso es legendaria)
 */
export function TrailMark({ tier, width = 22 }: { tier: number; width?: number }) {
  const palette = usePalette();
  const info = rarityInfo(tier);
  const h = Math.round(width * 0.36);
  const color =
    info.mark === 'green' ? palette.leaf : info.mark === 'yellow' ? palette.sun : info.mark === 'red' ? palette.red : '#FFFFFF';
  return (
    <View
      accessibilityLabel={`Rareza: ${info.label}`}
      style={[styles.wrap, { width, borderColor: palette.lineStrong }]}>
      <View style={{ height: h, backgroundColor: '#FFFFFF' }} />
      <View style={{ height: 1, backgroundColor: palette.lineStrong }} />
      {info.mark === 'foil' ? (
        <Svg width={width} height={h}>
          <Defs>
            <LinearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#7DE3C4" />
              <Stop offset="0.35" stopColor="#B49BFF" />
              <Stop offset="0.7" stopColor="#FFC56B" />
              <Stop offset="1" stopColor="#6FC3FF" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={h} fill="url(#foil)" />
        </Svg>
      ) : (
        <View style={{ height: h, backgroundColor: color }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 2, overflow: 'hidden' },
});
