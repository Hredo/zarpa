import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';

import type { MedalAccent, MedalDef, Tier } from '@/lib/achievements';
import { groupColor, usePalette, type Palette } from '@/theme';

import { Icon } from './Icon';
import { PawGlyph } from './Logo';

/*
 * Medallas de Zarpa. Una pieza de metal con cinta: roseta festoneada (14 lóbulos)
 * en bronce, plata u oro con degradado, aro interior y un disco del color de su
 * familia con el emblema dibujado a mano para cada tipo de logro (huella,
 * piedra preciosa, globo, banderín, hoja, reloj de arena, llama). Las de grupo
 * llevan el icono del grupo. Bloqueada, todo el metal pasa a gris pizarra y el
 * emblema se apaga.
 *
 * Los colores de metal son propios de esta pieza (no son de la paleta de la
 * interfaz): bronce, plata y oro tienen que leerse como metales.
 */

const METAL = {
  1: { light: '#E9B27C', mid: '#C9803F', dark: '#8F5524', ring: '#F6D3B0' },
  2: { light: '#F1F4F9', mid: '#B4BECC', dark: '#7D8798', ring: '#FFFFFF' },
  3: { light: '#FFE48A', mid: '#F2B72A', dark: '#B87E0B', ring: '#FFF3C2' },
} as const;

const LOCKED = { light: '#E7E5DE', mid: '#D3D0C7', dark: '#B9B5AA', ring: '#F1EFE9' };

export function metalOf(tier: Tier) {
  return tier === 0 ? LOCKED : METAL[tier];
}

/** Roseta festoneada: radio 43 con 14 lóbulos suaves, centrada en (50, 48). */
const ROSETTE = (() => {
  const pts: string[] = [];
  const n = 140;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 43 + 2.3 * Math.cos(14 * a);
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)} ${(48 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
})();

export function accentColors(accent: MedalAccent, palette: Palette): { color: string; tint: string } {
  switch (accent) {
    case 'brand':
      return { color: palette.brandInk, tint: palette.brandTint };
    case 'leaf':
      return { color: palette.leaf, tint: palette.leafTint };
    case 'sky':
      return { color: palette.sky, tint: palette.skyTint };
    case 'sun':
      return { color: '#B87E0B', tint: palette.sunTint };
    case 'red':
      return { color: palette.red, tint: palette.redTint };
    case 'strong':
      return { color: palette.strong, tint: palette.strongTint };
    default: {
      const g = groupColor(accent);
      return { color: g.color, tint: g.tint };
    }
  }
}

type Props = {
  def: MedalDef;
  tier: Tier;
  size?: number;
  /** Fuerza el aspecto bloqueado (gris) aunque haya nivel. */
  locked?: boolean;
};

/** Medalla. El alto es `size × 1,08` por la cinta. */
export function Medal({ def, tier, size = 88, locked }: Props) {
  const palette = usePalette();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const off = locked || tier === 0;
  const metal = off ? LOCKED : METAL[tier];
  const accent = accentColors(def.accent, palette);
  const ink = off ? palette.lineStrong : accent.color;
  const disc = off ? palette.surfaceAlt : accent.tint;
  const ribbon = off ? '#CFCCC2' : accent.color;
  const inner = size * 0.5;

  return (
    <View style={{ width: size, height: size * 1.08 }}>
      <Svg width={size} height={size * 1.08} viewBox="0 0 100 108">
        <Defs>
          <LinearGradient id={`m${id}`} x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={metal.light} />
            <Stop offset="0.5" stopColor={metal.mid} />
            <Stop offset="1" stopColor={metal.dark} />
          </LinearGradient>
        </Defs>
        {/* Cinta: dos colas detrás de la roseta. */}
        <Polygon points="27,70 49,78 41,107 34,98 23,103" fill={ribbon} />
        <Polygon points="73,70 51,78 59,107 66,98 77,103" fill={ribbon} opacity={0.82} />
        <Path d={ROSETTE} fill={`url(#m${id})`} />
        <Circle cx={50} cy={48} r={37} fill="none" stroke={metal.ring} strokeWidth={2.4} opacity={0.9} />
        <Circle cx={50} cy={48} r={33.5} fill={disc} />
        <Emblem def={def} ink={ink} off={off} />
      </Svg>
      {def.family === 'group' && def.group ? (
        <View style={[styles.icon, { top: size * 0.48 - inner / 2 + 1, left: (size - inner) / 2, width: inner, height: inner }]} pointerEvents="none">
          <Icon name={def.group} size={inner * 0.78} color={ink} strokeWidth={2.1} />
        </View>
      ) : null}
    </View>
  );
}

function Emblem({ def, ink, off }: { def: MedalDef; ink: string; off: boolean }) {
  const s = { stroke: ink, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (def.family) {
    case 'group':
      return null;
    case 'total':
      return (
        <G transform="translate(25 23) scale(0.5)">
          <PawGlyph fill={ink} />
        </G>
      );
    case 'rarity': {
      // Piedra tallada. «Buen ojo» una, «Rareza» con destello, «Leyenda» con tres.
      const sparks = def.id === 'rareza-escasa' ? 0 : def.id === 'rareza-rara' ? 1 : 3;
      return (
        <G>
          <Polygon points="36,42 43,34 57,34 64,42 50,66" {...s} fill={off ? 'none' : ink} fillOpacity={0.16} />
          <Path d="M36 42H64M43 34L46 42L50 66L54 42L57 34M46 42L50 34L54 42" {...s} strokeWidth={2.2} />
          {sparks >= 1 ? <Path d="M68 28V36M64 32H72" {...s} strokeWidth={2.2} /> : null}
          {sparks >= 3 ? <Path d="M31 31V37M28 34H34M70 56V61M67.5 58.5H72.5" {...s} strokeWidth={2} /> : null}
        </G>
      );
    }
    case 'region':
      return (
        <G>
          <Circle cx={50} cy={48} r={19} {...s} />
          <Ellipse cx={50} cy={48} rx={8} ry={19} {...s} strokeWidth={2.2} />
          <Path d="M31.5 42H68.5M31.5 54H68.5M50 29V67" {...s} strokeWidth={2.2} />
        </G>
      );
    case 'country':
      return (
        <G>
          <Path d="M38 66V30" {...s} />
          <Path d="M38 31C46 27 52 36 62 32V50C52 54 46 45 38 49Z" {...s} fill={off ? 'none' : ink} fillOpacity={0.18} />
          <Path d="M33 66H45" {...s} />
        </G>
      );
    case 'threatened':
      if (def.id === 'peligro-critico') {
        // Reloj de arena: queda poco tiempo.
        return (
          <G>
            <Path d="M38 31H62M38 65H62" {...s} />
            <Path d="M41 31C41 42 50 44 50 48C50 52 41 54 41 65M59 31C59 42 50 44 50 48C50 52 59 54 59 65" {...s} strokeWidth={2.4} />
            <Path d="M45 60H55L50 54Z" fill={off ? 'none' : ink} stroke="none" />
          </G>
        );
      }
      // Hoja protegida por un arco.
      return (
        <G>
          <Path d="M50 63C37 61 34 48 40 39C47 40 52 36 62 33C63 46 60 60 50 63Z" {...s} fill={off ? 'none' : ink} fillOpacity={0.18} />
          <Path d="M42 60C48 52 54 44 60 37" {...s} strokeWidth={2.2} />
        </G>
      );
    case 'streak':
      return (
        <G>
          <Path
            d="M50 28C52 37 63 42 61 55C60 63 55 68 50 68C44 68 38 63 38 55C38 49 42 46 43 41C46 44 48 43 48 39C48 35 49 31 50 28Z"
            {...s}
            fill={off ? 'none' : ink}
            fillOpacity={0.18}
          />
          <Path d="M50 68C46 68 44 64 45 60C46 56 49 55 50 51C52 55 55 57 55 61C55 65 53 68 50 68Z" {...s} strokeWidth={2.2} />
        </G>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  icon: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
