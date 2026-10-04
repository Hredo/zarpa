import { dark, light, type Palette } from '@/theme/tokens';

/*
 * Contraste mínimo (WCAG AA, 4,5:1 para texto) de cada pareja de colores que
 * la interfaz usa para texto, en claro y en oscuro. Hugo lo pide en todos sus
 * proyectos y la app se lee al sol.
 */
function lum(hex: string): number {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const PAIRS: [keyof Palette, keyof Palette][] = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['inkSoft', 'bg'],
  ['inkSoft', 'surface'],
  ['inkFaint', 'bg'],
  ['inkFaint', 'surface'],
  ['onForest', 'forest'],
  ['onForestSoft', 'forest'],
  ['onForest', 'forestDeep'],
  ['onBlaze', 'blaze'],
  ['danger', 'bg'],
  ['trailRed', 'surface'],
];

describe.each([
  ['claro', light],
  ['oscuro', dark],
])('modo %s', (_name, p) => {
  it.each(PAIRS)('%s sobre %s llega a 4,5:1', (fg, bg) => {
    expect(ratio(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
