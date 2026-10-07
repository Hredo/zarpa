import { Canvas, Group, Image as SkiaImage, LinearGradient, Rect, useImage, vec } from '@shopify/react-native-skia';
import { DeviceMotion } from 'expo-sensors';
import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { useDerivedValue, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

/*
 * Pegatina con brillo de cromo.
 *
 * Las especies raras y legendarias se ven como los cromos brillantes de un
 * álbum: un degradado iridiscente que se desplaza al inclinar el móvil. Se
 * pinta con Skia en modo `srcATop`, así que el brillo solo cae sobre los
 * píxeles de la pegatina (el animal y su borde blanco), nunca sobre el fondo.
 * Con «reducir movimiento» el brillo queda quieto.
 */
const FOIL = ['#7DE3C4', '#B49BFF', '#FFC56B', '#6FC3FF', '#FF9BC7', '#7DE3C4'];

export function HoloSticker({ uri, size, foil }: { uri: string; size: number; foil: boolean }) {
  const image = useImage(uri);
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const tilt = useSharedValue(0);

  // El sensor solo escucha mientras la pantalla está delante (con otra encima,
  // o en segundo plano, seguía leyendo y gastando batería).
  useEffect(() => {
    if (!foil || reduced || !focused) return;
    DeviceMotion.setUpdateInterval(80);
    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (!rotation) return;
      // gamma: inclinación lateral en radianes. Se limita para que el brillo
      // no se salga de la pegatina con el móvil de canto.
      const g = Math.max(-0.9, Math.min(0.9, rotation.gamma));
      tilt.set(withTiming(g, { duration: 90 }));
    });
    return () => sub.remove();
  }, [foil, reduced, focused, tilt]);

  const start = useDerivedValue(() => vec(-size * 0.8 + tilt.get() * size, 0));
  const end = useDerivedValue(() => vec(size * 1.8 + tilt.get() * size, size));

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group>
        {image ? <SkiaImage image={image} x={0} y={0} width={size} height={size} fit="contain" /> : null}
        {foil && image ? (
          <Rect x={0} y={0} width={size} height={size} blendMode="srcATop" opacity={0.32}>
            <LinearGradient start={start} end={end} colors={FOIL} />
          </Rect>
        ) : null}
      </Group>
    </Canvas>
  );
}
