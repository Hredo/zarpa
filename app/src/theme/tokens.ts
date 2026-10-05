import { Easing } from 'react-native-reanimated';

import type { GroupCode } from '@/lib/groups';

/*
 * Sistema visual de Zarpa · «Martín pescador».
 *
 * El mundo es un álbum de pegatinas de animales a pleno sol, y su paleta sale
 * de un animal concreto: el martín pescador, azul noche por la espalda y
 * mandarina en el pecho. Fondo claro y luminoso (la app se usa fuera, de día,
 * con el móvil en una mano), tinta azul noche en vez de negro, y color de
 * verdad repartido con trabajo:
 *
 *   - `brand` (mandarina) es la marca y la acción principal: el botón de
 *     Avistar, el logo, los avisos de «nuevo». Lleva SIEMPRE tinta encima
 *     (`onBrand`, 6:1); en blanco no llega a AA.
 *   - `strong` (azul noche) es la selección: chips activos, pestaña activa,
 *     botones secundarios fuertes. Lleva blanco encima (16:1).
 *   - `sun`, `leaf`, `sky`, `red` son acentos con oficio (rareza, éxito, agua,
 *     lo raro o nuevo). Nunca fondos de pantalla.
 *   - Cada grupo animal tiene su color (`groupColors`): orienta en el álbum y
 *     da el color a las fichas. El verde es uno más, no el fondo de todo.
 *   - Las categorías de la UICN usan los colores oficiales de la Lista Roja.
 *
 * Solo hay modo claro: Hugo lo quiere así siempre, sin seguir al sistema.
 */

export type Palette = {
  /** Fondo de pantalla: blanco piedra, luminoso, apenas cálido. */
  bg: string;
  /** Tarjetas, barras, hojas. */
  surface: string;
  /** Huecos, pistas de medidores, miniaturas sin foto. */
  surfaceAlt: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  line: string;
  lineStrong: string;
  /** Mandarina: marca y acción principal. Texto encima: `onBrand`. */
  brand: string;
  onBrand: string;
  /** Mandarina oscura para texto o iconos de marca sobre fondo claro. */
  brandInk: string;
  /** Fondo suave de marca (avisos, insignias de «nuevo»). */
  brandTint: string;
  /** Azul noche: selección y botones fuertes. Texto encima: `onStrong`. */
  strong: string;
  strongDeep: string;
  onStrong: string;
  onStrongSoft: string;
  /** Azul noche muy suave para fondos de selección ligera. */
  strongTint: string;
  sun: string;
  onSun: string;
  sunTint: string;
  leaf: string;
  leafTint: string;
  sky: string;
  skyTint: string;
  red: string;
  redTint: string;
  danger: string;
  scrim: string;
  /** Sombra de tarjetas (siempre con desplazamiento y difuminado). */
  shadow: string;
};

export const light: Palette = {
  bg: '#F7F6F2',
  surface: '#FFFFFF',
  surfaceAlt: '#EEECE6',
  ink: '#14213D',
  inkSoft: '#46506A',
  inkFaint: '#5C6680',
  line: '#E3E1DA',
  lineStrong: '#C5C2B8',
  brand: '#FF7A1A',
  onBrand: '#14213D',
  brandInk: '#B4470A',
  brandTint: '#FFEBDB',
  strong: '#14213D',
  strongDeep: '#0C1529',
  onStrong: '#FFFFFF',
  onStrongSoft: '#C9D3EA',
  strongTint: '#E6EAF3',
  sun: '#FFC53D',
  onSun: '#14213D',
  sunTint: '#FFF4D6',
  leaf: '#2F9E55',
  leafTint: '#E1F3E7',
  sky: '#1F6FD1',
  skyTint: '#E2EDFB',
  red: '#C41E3A',
  redTint: '#FCE4E7',
  danger: '#C62828',
  scrim: 'rgba(12, 21, 41, 0.5)',
  shadow: '#14213D',
};

/** Paleta única. Se conserva el nombre `palette` para quien no use el hook. */
export const palette = light;

/*
 * Color por grupo animal. `color` es el tono pleno (iconos, puntos, barras;
 * ≥ 3:1 sobre blanco), `tint` el fondo suave de chips y cabeceras y `ink` el
 * texto sobre `tint` (≥ 4,5:1, también sobre blanco). Lo comprueba
 * tests/contrast.test.ts.
 */
export type GroupColor = { color: string; tint: string; ink: string };

export const groupColors: Record<GroupCode, GroupColor> = {
  mamifero: { color: '#B45A2A', tint: '#F5E8E1', ink: '#A1532C' },
  ave: { color: '#2F6FE4', tint: '#E2EBFB', ink: '#2B63C9' },
  reptil: { color: '#5E8F1A', tint: '#E8EFDF', ink: '#4C7522' },
  anfibio: { color: '#11916F', tint: '#DEF0EB', ink: '#127663' },
  pez: { color: '#0B8AA6', tint: '#DDEFF3', ink: '#0D718D' },
  insecto: { color: '#B2820C', tint: '#FAF1DB', ink: '#86671A' },
  aracnido: { color: '#7B4BB7', tint: '#EDE6F5', ink: '#7B4BB7' },
  crustaceo: { color: '#E0533A', tint: '#FBE7E3', ink: '#AF473B' },
  miriapodo: { color: '#9A6B2F', tint: '#F1EAE2', ink: '#876131' },
  molusco: { color: '#D14C8C', tint: '#F9E6EF', ink: '#A7437B' },
  cnidario: { color: '#5B5FD6', tint: '#E8E9F9', ink: '#575BCD' },
  equinodermo: { color: '#C7365F', tint: '#F7E3E9', ink: '#B9345C' },
  anelido: { color: '#B5687A', tint: '#F5EAEC', ink: '#92586D' },
  esponja: { color: '#9C8605', tint: '#F3EFDB', ink: '#766A15' },
  otro: { color: '#64708A', tint: '#E9EBEF', ink: '#5C6882' },
};

/** Color del grupo, con «otro» de respaldo si el código no se conoce. */
export function groupColor(code: string | null | undefined): GroupColor {
  return groupColors[(code ?? 'otro') as GroupCode] ?? groupColors.otro;
}

/** Colores oficiales de la Lista Roja de la UICN (iucnredlist.org). */
export const iucnColors: Record<string, { bg: string; fg: string }> = {
  EX: { bg: '#000000', fg: '#FFFFFF' },
  EW: { bg: '#542344', fg: '#FFFFFF' },
  CR: { bg: '#D81E05', fg: '#FFFFFF' },
  EN: { bg: '#FC7F3F', fg: '#1A0E06' },
  VU: { bg: '#F9E814', fg: '#1A1A06' },
  NT: { bg: '#CCE226', fg: '#141A06' },
  LC: { bg: '#60C659', fg: '#0B1A0A' },
  DD: { bg: '#D1D1C6', fg: '#1A1A16' },
};

/*
 * Tipografía.
 *
 *   - Bricolage Grotesque: rótulo ancho, redondo y con carácter (trampas de
 *     tinta, «a» y «g» con gracia). Amable sin ser infantil; para nombres de
 *     especie, títulos y cifras grandes. Solo de 600 a 800.
 *   - Atkinson Hyperlegible Next: diseñada para baja visión. Se queda porque la
 *     pantalla se lee al sol y con prisa.
 *   - Atkinson Hyperlegible Mono: solo para medidas reales (coordenadas,
 *     aumentos, recuentos), nunca como disfraz «técnico».
 */
export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBlack: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  text: 'AtkinsonHyperlegibleNext_400Regular',
  textItalic: 'AtkinsonHyperlegibleNext_400Regular_Italic',
  textMedium: 'AtkinsonHyperlegibleNext_500Medium',
  textBold: 'AtkinsonHyperlegibleNext_700Bold',
  textBoldItalic: 'AtkinsonHyperlegibleNext_700Bold_Italic',
  mono: 'AtkinsonHyperlegibleMono_400Regular',
  monoMedium: 'AtkinsonHyperlegibleMono_500Medium',
} as const;

/* Escala ~1,25. Bricolage es ancha: los rótulos van más pequeños que con una condensada. */
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.displayBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.text, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.textBold, fontSize: 16, lineHeight: 24 },
  sci: { fontFamily: fonts.textItalic, fontSize: 15, lineHeight: 20 },
  label: { fontFamily: fonts.textBold, fontSize: 13, lineHeight: 16, letterSpacing: 0.2 },
  small: { fontFamily: fonts.text, fontSize: 13, lineHeight: 18 },
  data: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 16 },
  dataLarge: { fontFamily: fonts.monoMedium, fontSize: 18, lineHeight: 22 },
  /** Cifra grande de StatTile y contadores: rótulo, con cifras de ancho fijo. */
  stat: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.4, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Radios generosos: pegatinas con las esquinas cortadas en curva. */
export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 } as const;

/** Elevaciones. Sombra azul noche suave, siempre con desplazamiento. */
export const elevation = {
  card: { shadowColor: light.shadow, shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  raised: { shadowColor: light.shadow, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
} as const;

/** Tamaños de icono. */
export const iconSize = { sm: 16, md: 20, lg: 24, xl: 32 } as const;

/*
 * Movimiento. Sin muelles que boten (decisión de Hugo del 2026-09-19 para
 * todos sus proyectos): `withTiming` con estas curvas, o `withSpring` con
 * `dampingRatio: 1` (críticamente amortiguado, sin rebasar). Nada entra con
 * `ease-in`: retrasa justo el instante que el usuario está mirando.
 */
export const ease = {
  /** Entradas, pulsación, casi todo. */
  out: Easing.bezier(0.23, 1, 0.32, 1),
  /** Algo que ya está en pantalla y se mueve o cambia de forma. */
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  /** Hojas y paneles que suben. */
  sheet: Easing.bezier(0.32, 0.72, 0, 1),
} as const;

export const duration = {
  press: 120,
  small: 180,
  enter: 260,
  emphasis: 420,
  /** Medidores y contadores: se llenan despacio para que se lean. */
  fill: 700,
  reveal: 700,
} as const;

/** Retardo entre elementos de una entrada escalonada y tope de elementos animados. */
export const stagger = { step: 45, max: 8 } as const;

/** Distancia de las entradas (px): casi nada, lo justo para que se note el origen. */
export const ENTER_DISTANCE = 12;

/** Muelle sin rebote, para lo que arrastra un dedo. */
export const SPRING_NO_BOUNCE = { duration: 400, dampingRatio: 1 } as const;

/** Escala al pulsar: física pero imperceptible, siempre en 120 ms. */
export const PRESS_SCALE = 0.97;

/** Altura del área táctil mínima (iOS 44 pt, Android 48 dp). */
export const HIT = 48;
