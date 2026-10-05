import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { usePalette } from '@/theme';

import { PawGlyph } from './Logo';

/*
 * Iconos propios, todos en la misma rejilla de 24 px, trazo de 1,9 y uniones
 * redondeadas. Nada de emojis ni de glifos Unicode haciendo de icono.
 *
 * API: `<Icon name="leaf" size={20} color={palette.leaf} />`. Tamaños de la
 * escala `iconSize` (16 · 20 · 24 · 32). Sin `color` usa la tinta. Los iconos
 * de grupo se llaman como el código del grupo (`mamifero`, `ave`…), así que
 * `<Icon name={species.grp} />` funciona directamente.
 */

export type IconName =
  | 'rastro'
  | 'bestiario'
  | 'avistar'
  | 'atlas'
  | 'cuaderno'
  | 'search'
  | 'filter'
  | 'close'
  | 'back'
  | 'chevronRight'
  | 'chevronDown'
  | 'check'
  | 'pin'
  | 'layers'
  | 'flash'
  | 'flashOff'
  | 'flip'
  | 'info'
  | 'plus'
  | 'minus'
  | 'globe'
  | 'external'
  | 'bookmark'
  | 'bookmarkFilled'
  | 'share'
  | 'sort'
  | 'locate'
  | 'camera'
  | 'image'
  | 'warning'
  | 'shutter'
  | 'ruler'
  | 'weight'
  | 'hourglass'
  | 'leaf'
  | 'sun'
  | 'moon'
  | 'drop'
  | 'wave'
  | 'tree'
  | 'mountain'
  | 'egg'
  | 'heart'
  | 'heartFilled'
  | 'star'
  | 'sparkle'
  | 'eye'
  | 'calendar'
  | 'mamifero'
  | 'ave'
  | 'reptil'
  | 'anfibio'
  | 'pez'
  | 'insecto'
  | 'aracnido'
  | 'crustaceo'
  | 'miriapodo'
  | 'molusco'
  | 'cnidario'
  | 'equinodermo'
  | 'anelido'
  | 'esponja'
  | 'otro';

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

export function Icon({ name, size = 24, color, strokeWidth = 1.9 }: Props) {
  const palette = usePalette();
  const c = color ?? palette.ink;
  const s = { stroke: c, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {draw(name, s, c)}
    </Svg>
  );
}

type Stroke = { stroke: string; strokeWidth: number; strokeLinecap: 'round'; strokeLinejoin: 'round'; fill: string };

function draw(name: IconName, s: Stroke, c: string) {
  switch (name) {
    case 'rastro':
      // La huella del logo, en trazo.
      return (
        <G transform="translate(-0.4 0.4) scale(0.248)">
          <PawGlyph stroke={c} strokeWidth={s.strokeWidth / 0.248} />
        </G>
      );
    case 'bestiario':
      // Álbum abierto con dos cromos.
      return (
        <>
          <Path {...s} d="M3 5.5c2.7-.9 5.7-.9 9 .8 3.3-1.7 6.3-1.7 9-.8v13c-2.7-.9-5.7-.9-9 .8-3.3-1.7-6.3-1.7-9-.8z" />
          <Line {...s} x1="12" y1="6.3" x2="12" y2="19.3" />
          <Rect {...s} x="5.4" y="8.6" width="4.2" height="5.2" rx="0.6" />
          <Rect {...s} x="14.4" y="8.6" width="4.2" height="5.2" rx="0.6" />
        </>
      );
    case 'avistar':
      return (
        <>
          <Path {...s} d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
          <Circle {...s} cx="12" cy="12" r="3.6" />
          <Circle cx="12" cy="12" r="1.1" fill={c} />
        </>
      );
    case 'atlas':
      return (
        <>
          <Path {...s} d="M3 6.2 8.5 4l7 2.4L21 4.2v13.6L15.5 20l-7-2.4L3 19.8z" />
          <Line {...s} x1="8.5" y1="4" x2="8.5" y2="17.6" />
          <Line {...s} x1="15.5" y1="6.4" x2="15.5" y2="20" />
        </>
      );
    case 'cuaderno':
      // Pegatina con la esquina levantada.
      return (
        <>
          <Path {...s} d="M20 13.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7.5z" />
          <Path {...s} d="M13.5 20v-4.5a2 2 0 0 1 2-2H20" />
          <Path {...s} d="M8 9.5c1.2-1.4 2.8-1.4 4 0s2.8 1.4 4 0" />
        </>
      );
    case 'search':
      return (
        <>
          <Circle {...s} cx="10.8" cy="10.8" r="6.3" />
          <Line {...s} x1="15.4" y1="15.4" x2="20.5" y2="20.5" />
        </>
      );
    case 'filter':
      return (
        <>
          <Line {...s} x1="4" y1="7" x2="20" y2="7" />
          <Line {...s} x1="4" y1="12" x2="20" y2="12" />
          <Line {...s} x1="4" y1="17" x2="20" y2="17" />
          <Circle cx="9" cy="7" r="2.1" fill={c} />
          <Circle cx="15.5" cy="12" r="2.1" fill={c} />
          <Circle cx="7.5" cy="17" r="2.1" fill={c} />
        </>
      );
    case 'close':
      return (
        <>
          <Line {...s} x1="6" y1="6" x2="18" y2="18" />
          <Line {...s} x1="18" y1="6" x2="6" y2="18" />
        </>
      );
    case 'back':
      return <Path {...s} d="M15 5l-7 7 7 7" />;
    case 'chevronRight':
      return <Path {...s} d="M9.5 5.5 16 12l-6.5 6.5" />;
    case 'chevronDown':
      return <Path {...s} d="M5.5 9.5 12 16l6.5-6.5" />;
    case 'check':
      return <Path {...s} d="M5 12.5l4.5 4.5L19 7.5" />;
    case 'pin':
      return (
        <>
          <Path {...s} d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
          <Circle {...s} cx="12" cy="10" r="2.4" />
        </>
      );
    case 'layers':
      return (
        <>
          <Path {...s} d="M12 3.5 21 8.2l-9 4.7-9-4.7z" />
          <Path {...s} d="M3 12.3l9 4.7 9-4.7" />
          <Path {...s} d="M3 16.3 12 21l9-4.7" />
        </>
      );
    case 'flash':
      return <Path {...s} d="M13 2.8 5.5 13.2H11l-1 8 7.5-10.4H12z" />;
    case 'flashOff':
      return (
        <>
          <Path {...s} d="M13 2.8 9.7 7.4M7.6 10.3l-2.1 2.9H11l-1 8 3.8-5.3M15.9 12.4l1.6-1.6H12" />
          <Line {...s} x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
        </>
      );
    case 'flip':
      return (
        <>
          <Path {...s} d="M4 9.5a8 8 0 0 1 14.2-3.2M20 14.5a8 8 0 0 1-14.2 3.2" />
          <Path {...s} d="M18.6 2.8v3.8h-3.8M5.4 21.2v-3.8h3.8" />
        </>
      );
    case 'info':
      return (
        <>
          <Circle {...s} cx="12" cy="12" r="9" />
          <Line {...s} x1="12" y1="11" x2="12" y2="16.5" />
          <Circle cx="12" cy="7.8" r="1.15" fill={c} />
        </>
      );
    case 'plus':
      return (
        <>
          <Line {...s} x1="12" y1="5" x2="12" y2="19" />
          <Line {...s} x1="5" y1="12" x2="19" y2="12" />
        </>
      );
    case 'minus':
      return <Line {...s} x1="5" y1="12" x2="19" y2="12" />;
    case 'globe':
      return (
        <>
          <Circle {...s} cx="12" cy="12" r="9" />
          <Path {...s} d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9S14.6 18.4 12 21c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
        </>
      );
    case 'external':
      return (
        <>
          <Path {...s} d="M13.5 4.5H19.5V10.5" />
          <Line {...s} x1="19.5" y1="4.5" x2="11" y2="13" />
          <Path {...s} d="M17.5 13.5v4.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h4.5" />
        </>
      );
    case 'bookmark':
      return <Path {...s} d="M6.5 3.5h11v17L12 16.2l-5.5 4.3z" />;
    case 'bookmarkFilled':
      return <Path d="M6.5 3.5h11v17L12 16.2l-5.5 4.3z" fill={c} stroke={c} strokeWidth={s.strokeWidth} strokeLinejoin="round" />;
    case 'share':
      return (
        <>
          <Path {...s} d="M12 3.5v11.5M7.5 8 12 3.5 16.5 8" />
          <Path {...s} d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" />
        </>
      );
    case 'sort':
      return (
        <>
          <Path {...s} d="M7 4v16M3.5 16.5 7 20l3.5-3.5" />
          <Path {...s} d="M17 20V4M13.5 7.5 17 4l3.5 3.5" />
        </>
      );
    case 'locate':
      return (
        <>
          <Circle {...s} cx="12" cy="12" r="6.5" />
          <Circle cx="12" cy="12" r="2.2" fill={c} />
          <Path {...s} d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
        </>
      );
    case 'camera':
      return (
        <>
          <Path {...s} d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.6l1.4-2.2h5l1.4 2.2h2.6A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
          <Circle {...s} cx="12" cy="12.8" r="3.4" />
        </>
      );
    case 'image':
      return (
        <>
          <Rect {...s} x="3.5" y="4.5" width="17" height="15" rx="2" />
          <Circle {...s} cx="9" cy="9.5" r="1.6" />
          <Path {...s} d="M4 17l4.8-4.6 3.6 3.2 2.9-2.6L20 17.6" />
        </>
      );
    case 'warning':
      return (
        <>
          <Path {...s} d="M12 3.8 21.2 19.5H2.8z" />
          <Line {...s} x1="12" y1="9.5" x2="12" y2="14" />
          <Circle cx="12" cy="16.8" r="1.1" fill={c} />
        </>
      );
    case 'shutter':
      return <Circle {...s} cx="12" cy="12" r="8.5" />;
    case 'ruler':
      return (
        <>
          <Rect {...s} x="2.8" y="8" width="18.4" height="8" rx="1.6" transform="rotate(-30 12 12)" />
          <Path {...s} d="M6.5 8v3M9.5 8v4.5M12.5 8v3M15.5 8v4.5M18.5 8v3" transform="rotate(-30 12 12)" />
        </>
      );
    case 'weight':
      return (
        <>
          <Path {...s} d="M6.6 8.5h10.8l2.3 11.5H4.3z" />
          <Circle {...s} cx="12" cy="5.6" r="2.4" />
        </>
      );
    case 'hourglass':
      return (
        <>
          <Path {...s} d="M6.5 3.5h11M6.5 20.5h11" />
          <Path {...s} d="M7.5 3.5c0 4.2 4.5 5.6 4.5 8.5s-4.5 4.3-4.5 8.5M16.5 3.5c0 4.2-4.5 5.6-4.5 8.5s4.5 4.3 4.5 8.5" />
        </>
      );
    case 'leaf':
      return (
        <>
          <Path {...s} d="M5 19c-.6-7.6 4.2-13.6 14.5-14.5.6 10.3-5.6 15.4-13.4 14.6z" />
          <Path {...s} d="M5 19c3.2-4.4 6.4-7.4 10-9.6" />
        </>
      );
    case 'sun':
      return (
        <>
          <Circle {...s} cx="12" cy="12" r="4" />
          <Path {...s} d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
        </>
      );
    case 'moon':
      return <Path {...s} d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" />;
    case 'drop':
      return <Path {...s} d="M12 3.2s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" />;
    case 'wave':
      return (
        <>
          <Path {...s} d="M2.8 9.5c1.5-1.4 3.1-1.4 4.6 0s3.1 1.4 4.6 0 3.1-1.4 4.6 0 3.1 1.4 4.6 0" />
          <Path {...s} d="M2.8 14.5c1.5-1.4 3.1-1.4 4.6 0s3.1 1.4 4.6 0 3.1-1.4 4.6 0 3.1 1.4 4.6 0" />
        </>
      );
    case 'tree':
      return (
        <>
          <Path {...s} d="M12 3c3.6 0 6 2.9 6 6.2 0 3.6-2.7 6-6 6s-6-2.4-6-6C6 5.9 8.4 3 12 3z" />
          <Path {...s} d="M12 9.5v11.5M9 21h6M12 13.2l2.4-2" />
        </>
      );
    case 'mountain':
      return (
        <>
          <Path {...s} d="M2.5 19.5 9 8.5l4 6.6 2.5-3.6 6 8z" />
          <Path {...s} d="M7.2 11.6 9 12.6l1.6-1.2" />
        </>
      );
    case 'egg':
      return <Path {...s} d="M12 3.2c3.4 0 6.2 5.3 6.2 9.6 0 4.2-2.8 7.8-6.2 7.8s-6.2-3.6-6.2-7.8c0-4.3 2.8-9.6 6.2-9.6z" />;
    case 'heart':
      return <Path {...s} d="M12 20s-7.8-4.7-7.8-10.3A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.8 2.5C19.8 15.3 12 20 12 20z" />;
    case 'heartFilled':
      return (
        <Path
          d="M12 20s-7.8-4.7-7.8-10.3A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.8 2.5C19.8 15.3 12 20 12 20z"
          fill={c}
          stroke={c}
          strokeWidth={s.strokeWidth}
          strokeLinejoin="round"
        />
      );
    case 'star':
      return <Path {...s} d="M12 3.4l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.7l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z" />;
    case 'sparkle':
      return (
        <>
          <Path {...s} d="M10 3.5c.6 3.8 2.2 5.4 6 6-3.8.6-5.4 2.2-6 6-.6-3.8-2.2-5.4-6-6 3.8-.6 5.4-2.2 6-6z" />
          <Path {...s} d="M17.8 14.5c.3 1.8 1 2.5 2.7 2.7-1.7.3-2.4 1-2.7 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.2 2.5-.9 2.8-2.7z" />
        </>
      );
    case 'eye':
      return (
        <>
          <Path {...s} d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
          <Circle {...s} cx="12" cy="12" r="3.2" />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect {...s} x="3.5" y="5" width="17" height="15.5" rx="2.2" />
          <Path {...s} d="M3.5 10h17M8 3v4M16 3v4" />
        </>
      );
    case 'mamifero':
      return (
        <G transform="translate(-0.4 0.4) scale(0.248)">
          <PawGlyph stroke={c} strokeWidth={s.strokeWidth / 0.248} />
        </G>
      );
    case 'ave':
      return (
        <>
          <Path {...s} d="M3.5 12.5c3.5-.3 5.8-1.8 7.2-4.6a3.4 3.4 0 0 1 6.6.4l3.2 1.2-3.1 1.4c-.3 4.6-3.6 7.6-8.3 7.6-2.4 0-4.4-1-5.6-2.9" />
          <Path {...s} d="M9 17.6 7.6 20.8M12 17.3l.4 3.5" />
          <Circle cx="14.6" cy="8.4" r="0.9" fill={c} />
        </>
      );
    case 'reptil':
      return (
        <>
          <Path {...s} d="M4 19.5c2.4.7 4.4.3 5.8-1.3l3.4-4.1c1.3-1.6 3.1-2.1 4.6-1.4l2.2-1.6-1.3-2.1c-1.9-.8-4.1 0-5.6 1.7L9.6 15c-1.4 1.6-3.4 2.1-5.6 1.6" />
          <Path {...s} d="M11.4 16.2 9.8 13.6M14.6 12.6l2 2.2M8.6 18.7l.9 2.3M13.8 15.5l2.4.8" />
        </>
      );
    case 'anfibio':
      return (
        <>
          <Path {...s} d="M6.5 14c0-3.6 2.5-6.1 5.5-6.1s5.5 2.5 5.5 6.1-2.5 5-5.5 5-5.5-1.4-5.5-5z" />
          <Circle {...s} cx="9" cy="7.6" r="1.9" />
          <Circle {...s} cx="15" cy="7.6" r="1.9" />
          <Path {...s} d="M6.8 16.5 3.5 18.6M17.2 16.5l3.3 2.1M9.6 13.3c1.6 1 3.2 1 4.8 0" />
        </>
      );
    case 'pez':
      return (
        <>
          <Path {...s} d="M3.5 12c2.6-3.5 5.6-5.2 9-5.2 3.2 0 5.6 1.7 7.2 5.2-1.6 3.5-4 5.2-7.2 5.2-3.4 0-6.4-1.7-9-5.2z" />
          <Path {...s} d="M3.5 12 1.8 8.8M3.5 12l-1.7 3.2" />
          <Circle cx="16" cy="11" r="0.95" fill={c} />
          <Path {...s} d="M10.5 9.2c-.8 1.8-.8 3.8 0 5.6" />
        </>
      );
    case 'insecto':
      return (
        <>
          <Path {...s} d="M12 8.2c2.5 0 4.3 2.6 4.3 6s-1.8 6.3-4.3 6.3-4.3-2.9-4.3-6.3 1.8-6 4.3-6z" />
          <Line {...s} x1="12" y1="8.4" x2="12" y2="20.4" />
          <Circle {...s} cx="12" cy="5.8" r="2.2" />
          <Path {...s} d="M10.6 4 9 2.4M13.4 4 15 2.4M7.8 11.5 4.5 10M7.6 15H4M8 18.4l-3 1.7M16.2 11.5l3.3-1.5M16.4 15H20M16 18.4l3 1.7" />
        </>
      );
    case 'aracnido':
      return (
        <>
          <Circle {...s} cx="12" cy="14.8" r="3.3" />
          <Circle {...s} cx="12" cy="9.4" r="2" />
          <Path {...s} d="M10.3 8.7 6.5 5.5 4 7M13.7 8.7l3.8-3.2L20 7M9.4 10.4 4.5 10l-2 2.6M14.6 10.4l4.9-.4 2 2.6M9 13.6l-4.2 2.2-.7 3.2M15 13.6l4.2 2.2.7 3.2M9.9 17.3 7.4 20.6M14.1 17.3l2.5 3.3" />
        </>
      );
    case 'crustaceo':
      return (
        <>
          <Path {...s} d="M6.5 14c0-2.6 2.5-4.5 5.5-4.5s5.5 1.9 5.5 4.5-2.5 4.5-5.5 4.5-5.5-1.9-5.5-4.5z" />
          <Path {...s} d="M7.6 10.9 5.4 7.4M4.2 4.4c-.9 1-.9 2.4.2 3.2l1.6-.9M3 6.2l1.8.8M16.4 10.9l2.2-3.5M19.8 4.4c.9 1 .9 2.4-.2 3.2l-1.6-.9M21 6.2l-1.8.8M7.3 16.6l-3 2M16.7 16.6l3 2M9.4 18.2l-1.5 2.6M14.6 18.2l1.5 2.6" />
        </>
      );
    case 'miriapodo':
      return (
        <>
          <Path {...s} d="M4 18c2.8 0 3.6-2.4 5.6-3.9 1.8-1.4 3.9-.9 5.5-2.3 1.7-1.5 1.7-4.1 4.4-5.8" />
          <Path {...s} d="M6.2 17.4l-.9 2.4M7.6 16.1l2.2 1.8M9.2 14.6l-1.4-2.1M11.2 13.6l1 2.4M13.2 13.2l-.9-2.5M15.2 11.8l2.1 1.5M16.4 10.1l-2.1-1.5M17.6 8.1l2.2 1.3" />
        </>
      );
    case 'molusco':
      return (
        <>
          <Path {...s} d="M3.5 18.5h12.8c2.3 0 3.9-1.6 3.9-3.6 0-2-1.5-3.3-3.4-3.3" />
          <Path {...s} d="M15.5 14.8a5.2 5.2 0 1 0-10.4 0" />
          <Path {...s} d="M13 14.8a2.7 2.7 0 1 0-5.4 0" />
          <Path {...s} d="M17.2 11.6 18 7.8M19.2 12.6l2-3.2" />
        </>
      );
    case 'cnidario':
      return (
        <>
          <Path {...s} d="M4.5 11.5a7.5 7.5 0 0 1 15 0c-1.2.9-2.4.9-3.7 0-1.2.9-2.5.9-3.8 0-1.3.9-2.6.9-3.8 0-1.3.9-2.5.9-3.7 0z" />
          <Path {...s} d="M8 12.3c-.6 2.3.6 3.5 0 5.7M12 12.3c-.6 2.6.6 4.5 0 8.2M16 12.3c-.6 2.3.6 3.5 0 5.7" />
        </>
      );
    case 'equinodermo':
      return <Path {...s} d="M12 3.2l2.3 5.6 6 .4-4.6 3.9 1.5 5.8L12 15.7l-5.2 3.2 1.5-5.8-4.6-3.9 6-.4z" />;
    case 'anelido':
      return (
        <>
          <Path {...s} d="M3.5 15.5c1.8-3.4 4.2-3.4 6 0s4.2 3.4 6 0 3.6-3.4 5-1" />
          <Path {...s} d="M6 13.6v3.4M9 13.9v3.4M12 15.2v3.2M15 13.9v3.4M18 13v3" />
        </>
      );
    case 'esponja':
      return (
        <>
          <Path {...s} d="M7 20.5V9.5C7 6.5 9.2 4 12 4s5 2.5 5 5.5v11" />
          <Circle {...s} cx="10.2" cy="10" r="1.2" />
          <Circle {...s} cx="13.8" cy="13" r="1.2" />
          <Circle {...s} cx="10.6" cy="16.4" r="1.2" />
          <Line {...s} x1="5" y1="20.5" x2="19" y2="20.5" />
        </>
      );
    case 'otro':
      return (
        <>
          <Circle {...s} cx="12" cy="12" r="7.5" />
          <Path {...s} d="M8.5 12c1.2-1.6 2.3-1.6 3.5 0s2.3 1.6 3.5 0" />
        </>
      );
  }
}
