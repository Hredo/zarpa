import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import type { SizeInfo } from '@/db/catalog';
import {
  barFractions,
  formatSize,
  pickReference,
  ratioPhrase,
  sizeKindOf,
  type RefKey,
} from '@/lib/sizeScale';
import { radius, space, usePalette, type GroupColor } from '@/theme';
import type { GroupCode } from '@/lib/groups';

import { Icon } from '../Icon';
import { Meter } from '../Meter';
import { Txt } from '../Txt';

type Props = {
  size: SizeInfo;
  /** Código del grupo: su icono representa al animal. */
  grp: GroupCode | string;
  group: GroupColor;
  /** Nombre corto para la leyenda («Mide hasta 35 cm»). */
  name: string;
  /** Fuente del dato, ya redactada («AVONET, EltonTraits»). */
  credit?: string | null;
  big?: boolean;
};

function RefShape({ kind, color, size = 24 }: { kind: RefKey; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === 'person' && (
        <>
          <Circle {...p} cx="12" cy="4.6" r="2.3" />
          <Path {...p} d="M12 7.6v7M7.6 10.4 12 9l4.4 1.4M12 14.6l-3 6.4M12 14.6l3 6.4" />
        </>
      )}
      {kind === 'hand' && (
        <>
          <Path {...p} d="M8 11.5V6M11.3 11V4M14.6 11V5M17.8 12V8" />
          <Path {...p} d="M6 12.5h13V16a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5zM6 15l-2.4-3" />
        </>
      )}
      {kind === 'coin' && (
        <>
          <Circle {...p} cx="12" cy="12" r="8.5" />
          <Circle {...p} cx="12" cy="12" r="5" />
        </>
      )}
      {kind === 'sugar' && (
        <>
          <Path {...p} d="M6 4.5h12l-1 15H7z" />
          <Line {...p} x1="6.4" y1="8.5" x2="17.6" y2="8.5" />
          <Rect {...p} x="9.5" y="11.5" width="5" height="3.5" rx="0.8" />
        </>
      )}
    </Svg>
  );
}

/**
 * Tamaño a escala frente a una moneda, una mano o una persona: dos barras que
 * parten del mismo origen y comparten escala lineal (la mayor ocupa todo el
 * ancho), cada una con su figura. Se llenan al aparecer. Solo se pinta si el
 * catálogo trae `length_mm` o `mass_g` verificados.
 */
export function SizeCompare({ size, grp, group, name, credit, big }: Props) {
  const palette = usePalette();
  const sk = sizeKindOf(size);
  if (!sk) return null;
  const ref = pickReference(sk.kind, sk.value);
  const { animal, ref: refFrac } = barFractions(sk.value, ref.value);
  const text = sk.kind === 'length' ? 'Mide hasta' : 'Pesa unos';
  const shown = formatSize(sk.kind, sk.value);
  const kindNote = sk.kind === 'length' && size.length_kind ? ` (${size.length_kind})` : '';
  const iconPill = (child: React.ReactNode, bg: string) => <View style={[styles.pill, { backgroundColor: bg }]}>{child}</View>;

  return (
    <View style={styles.wrap}>
      <Txt variant={big ? 'heading' : 'subheading'} style={styles.phrase}>
        {ratioPhrase(sk.kind, sk.value, ref)}
      </Txt>
      <View style={styles.row}>
        {iconPill(<Icon name={grp as never} size={26} color={group.color} />, group.tint)}
        <View style={styles.flex}>
          <Meter value={animal} color={group.color} height={14} label={name} valueLabel={`${text} ${shown}${kindNote}`} delay={120} />
        </View>
      </View>
      <View style={styles.row}>
        {iconPill(<RefShape kind={ref.key} color={palette.inkSoft} size={26} />, palette.surfaceAlt)}
        <View style={styles.flex}>
          <Meter
            value={refFrac}
            color={palette.inkSoft}
            height={14}
            label={ref.short}
            valueLabel={formatSize(sk.kind, ref.value)}
            delay={260}
          />
        </View>
      </View>
      <Txt variant="small" tone="faint">
        Mismas escalas en las dos barras. {ref.short}: {ref.note}, medida media aproximada.
        {size.mass_g != null && sk.kind === 'length' ? ` Pesa unos ${formatSize('mass', size.mass_g)}.` : ''}
        {credit ? ` Fuente: ${credit}.` : ''}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  phrase: { marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  flex: { flex: 1 },
  pill: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
