import { Easing } from 'react-native-reanimated';

/*
 * Sistema visual de Zarpa.
 *
 * El mundo del que sale todo es el del monte en España: las marcas pintadas de
 * los senderos (blanco y rojo en los GR, blanco y amarillo en los PR, blanco y
 * verde en los SL), la cartografía topográfica y los álbumes de cromos. No es
 * decoración: cada color tiene un trabajo.
 *
 *   - `blaze` (amarillo de PR) es la acción principal. Se lee a pleno sol con
 *     tinta encima (12:1) y no se confunde con un error, que es lo que pasaría
 *     con el rojo.
 *   - `trailRed` (rojo de GR) marca lo nuevo y la rareza alta. Nunca un botón.
 *   - `forest` es el color de campo de las superficies «de marca» (cabeceras
 *     del Bestiario, tarjetas de especie sin foto).
 *   - Las categorías de la UICN usan los colores oficiales de la Lista Roja:
 *     son notación real que el usuario puede encontrarse fuera de la app.
 *
 * El modo claro es el principal: la app se usa en exteriores, de día, con el
 * móvil en una mano mientras se busca al animal. El oscuro existe para el
 * atardecer y la sombra del bosque, con el mismo contraste mínimo (4,5:1).
 * Ningún fondo es crema: es el gris líquen frío de las rocas con marcas.
 */

export type Palette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  line: string;
  lineStrong: string;
  forest: string;
  forestDeep: string;
  onForest: string;
  onForestSoft: string;
  blaze: string;
  onBlaze: string;
  trailRed: string;
  trailGreen: string;
  water: string;
  danger: string;
  scrim: string;
};

export const light: Palette = {
  bg: '#EEF1EA',
  surface: '#FFFFFF',
  surfaceAlt: '#E2E7DC',
  ink: '#0F1A14',
  inkSoft: '#36443B',
  inkFaint: '#56645B',
  line: '#CDD5C7',
  lineStrong: '#9AA79E',
  forest: '#163F2C',
  forestDeep: '#0D2A1D',
  onForest: '#F2F6EF',
  onForestSoft: '#B9CDBF',
  blaze: '#F5C400',
  onBlaze: '#0F1A14',
  trailRed: '#D32F27',
  trailGreen: '#2E8B4E',
  water: '#1C65A0',
  danger: '#B3261E',
  scrim: 'rgba(8, 14, 10, 0.55)',
};

export const dark: Palette = {
  bg: '#0B120E',
  surface: '#131C17',
  surfaceAlt: '#1B2620',
  ink: '#E8EEE5',
  inkSoft: '#B6C3BA',
  inkFaint: '#8F9D94',
  line: '#24312A',
  lineStrong: '#3C4B42',
  forest: '#1D5238',
  forestDeep: '#123426',
  onForest: '#EEF4EC',
  onForestSoft: '#A9C2B2',
  blaze: '#F5C400',
  onBlaze: '#0F1A14',
  trailRed: '#F0564E',
  trailGreen: '#4FB574',
  water: '#5AA6DE',
  danger: '#F2766F',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

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
 *   - Big Shoulders: rótulo condensado nacido de la señalética urbana; aquí hace
 *     de cartel de sendero para los nombres de especie y los títulos.
 *   - Atkinson Hyperlegible Next: diseñada para baja visión. Se elige porque la
 *     pantalla se lee al sol y con prisa, no por moda.
 *   - Atkinson Hyperlegible Mono: solo para medidas reales (coordenadas,
 *     aumentos, recuentos), nunca como disfraz «técnico».
 */
export const fonts = {
  display: 'BigShoulders_800ExtraBold',
  displayBlack: 'BigShoulders_900Black',
  displayBold: 'BigShoulders_700Bold',
  text: 'AtkinsonHyperlegibleNext_400Regular',
  textItalic: 'AtkinsonHyperlegibleNext_400Regular_Italic',
  textMedium: 'AtkinsonHyperlegibleNext_500Medium',
  textBold: 'AtkinsonHyperlegibleNext_700Bold',
  textBoldItalic: 'AtkinsonHyperlegibleNext_700Bold_Italic',
  mono: 'AtkinsonHyperlegibleMono_400Regular',
  monoMedium: 'AtkinsonHyperlegibleMono_500Medium',
} as const;

export const type = {
  hero: { fontFamily: fonts.displayBlack, fontSize: 52, lineHeight: 50, letterSpacing: -0.5 },
  title: { fontFamily: fonts.display, fontSize: 36, lineHeight: 36, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28 },
  subheading: { fontFamily: fonts.displayBold, fontSize: 20, lineHeight: 22, letterSpacing: 0.2 },
  body: { fontFamily: fonts.text, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.textBold, fontSize: 16, lineHeight: 24 },
  sci: { fontFamily: fonts.textItalic, fontSize: 15, lineHeight: 20 },
  label: { fontFamily: fonts.textBold, fontSize: 13, lineHeight: 16, letterSpacing: 0.3 },
  small: { fontFamily: fonts.text, fontSize: 13, lineHeight: 18 },
  data: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 16 },
  dataLarge: { fontFamily: fonts.monoMedium, fontSize: 18, lineHeight: 22 },
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 6, md: 10, lg: 16, xl: 24, pill: 999 } as const;

/*
 * Movimiento. Sin muelles en ninguna parte: Hugo no quiere animaciones que
 * boten (decisión del TFG del 2026-09-19, que aplica a todos sus proyectos).
 * Todo va con `withTiming` y estas curvas; ninguna entra con `ease-in`, que
 * retrasa justo el instante que el usuario está mirando.
 */
export const ease = {
  out: Easing.bezier(0.23, 1, 0.32, 1),
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  sheet: Easing.bezier(0.32, 0.72, 0, 1),
} as const;

export const duration = {
  press: 120,
  small: 180,
  enter: 260,
  emphasis: 420,
  reveal: 700,
} as const;

/** Escala al pulsar: física pero imperceptible, siempre en 120 ms. */
export const PRESS_SCALE = 0.97;

/** Altura del área táctil mínima (iOS 44 pt, Android 48 dp). */
export const HIT = 48;
