import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

type Props = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  w: SharedValue<number>;
  h: SharedValue<number>;
  /** 0 buscando · 1 animal encuadrado · 2 especie fijada */
  lock: SharedValue<number>;
  color: string;
  lockColor: string;
};

const ARM = 26;
const THICK = 4;

/*
 * Retícula de cuatro esquinas. Sigue la caja del animal que da el detector,
 * con transiciones cortas en curva de salida (sin muelles): así no tiembla con
 * el ruido de cada fotograma pero tampoco llega tarde. Solo se animan
 * transformaciones; la vista nunca cambia de tamaño.
 */
export function Reticle(props: Props) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Corner {...props} dx={0} dy={0} edge={styles.tl} />
      <Corner {...props} dx={1} dy={0} edge={styles.tr} />
      <Corner {...props} dx={0} dy={1} edge={styles.bl} />
      <Corner {...props} dx={1} dy={1} edge={styles.br} />
    </View>
  );
}

function Corner({ x, y, w, h, lock, color, lockColor, dx, dy, edge }: Props & { dx: 0 | 1; dy: 0 | 1; edge: ViewStyle }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() + dx * (w.get() - ARM) }, { translateY: y.get() + dy * (h.get() - ARM) }],
    borderColor: lock.get() >= 2 ? lockColor : color,
    opacity: lock.get() === 0 ? 0.85 : 1,
  }));
  return <Animated.View style={[styles.corner, edge, style]} />;
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', left: 0, top: 0, width: ARM, height: ARM },
  tl: { borderLeftWidth: THICK, borderTopWidth: THICK, borderTopLeftRadius: 6 },
  tr: { borderRightWidth: THICK, borderTopWidth: THICK, borderTopRightRadius: 6 },
  bl: { borderLeftWidth: THICK, borderBottomWidth: THICK, borderBottomLeftRadius: 6 },
  br: { borderRightWidth: THICK, borderBottomWidth: THICK, borderBottomRightRadius: 6 },
});
