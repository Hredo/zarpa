import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, space, usePalette } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

type Props = {
  title: string;
  children: ReactNode;
  /** Acción o dato a la derecha del título («Ver todas», un recuento). */
  aside?: ReactNode;
  /** Icono en una pastilla de color a la izquierda del título. */
  icon?: IconName;
  /** Color del icono y del trazo bajo el título; por defecto mandarina. */
  accent?: string;
  /** Fondo de la pastilla del icono; por defecto `surfaceAlt`. */
  tint?: string;
};

/**
 * Bloque de ficha o de pantalla: título en Bricolage con un trazo corto de
 * color debajo (o un icono en su pastilla) y el contenido. Más aire encima
 * (32) que debajo (16) del título.
 *
 * API: `<Section title="Dónde vive" icon="globe" accent={palette.sky} tint={palette.skyTint} aside={…}>…</Section>`
 */
export function Section({ title, children, aside, icon, accent, tint }: Props) {
  const palette = usePalette();
  const color = accent ?? palette.brand;
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        {icon ? (
          <View style={[styles.badge, { backgroundColor: tint ?? palette.surfaceAlt }]}>
            <Icon name={icon} size={20} color={color} />
          </View>
        ) : null}
        <View style={styles.titleWrap}>
          <Txt variant="heading" accessibilityRole="header">
            {title}
          </Txt>
          {icon ? null : <View style={[styles.rule, { backgroundColor: color }]} />}
        </View>
        {aside}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.xxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1 },
  rule: { height: 4, width: 28, borderRadius: 2, marginTop: space.xs },
  body: { marginTop: space.lg },
});
