import { GROUPS } from '@/lib/groups';
import { groupColors, iucnColors, light, type Palette } from '@/theme/tokens';

/*
 * Contraste mínimo (WCAG AA) de cada pareja de colores que la interfaz usa.
 * Hugo lo pide en todos sus proyectos y la app se lee al sol. Zarpa solo tiene
 * modo claro.
 *
 *   - Texto: 4,5:1.
 *   - Iconos y elementos gráficos (puntos, barras, bordes de estado): 3:1.
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

const TEXT: [keyof Palette, keyof Palette][] = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['ink', 'surfaceAlt'],
  ['inkSoft', 'bg'],
  ['inkSoft', 'surface'],
  ['inkSoft', 'surfaceAlt'],
  ['inkFaint', 'bg'],
  ['inkFaint', 'surface'],
  ['inkFaint', 'surfaceAlt'],
  ['onBrand', 'brand'],
  ['brandInk', 'bg'],
  ['brandInk', 'surface'],
  ['brandInk', 'brandTint'],
  ['brandInk', 'sunTint'],
  ['onStrong', 'strong'],
  ['onStrongSoft', 'strong'],
  ['onStrong', 'strongDeep'],
  ['onStrongSoft', 'strongDeep'],
  ['ink', 'strongTint'],
  ['onSun', 'sun'],
  ['ink', 'sunTint'],
  ['ink', 'leafTint'],
  ['ink', 'skyTint'],
  ['ink', 'redTint'],
  ['sky', 'surface'],
  ['red', 'surface'],
  ['red', 'redTint'],
  ['danger', 'bg'],
  ['danger', 'surface'],
];

const GRAPHIC: [keyof Palette, keyof Palette][] = [
  ['brand', 'strong'],
  ['leaf', 'surface'],
  ['sky', 'surface'],
  ['red', 'surface'],
];

describe('paleta clara', () => {
  it.each(TEXT)('texto %s sobre %s llega a 4,5:1', (fg, bg) => {
    expect(ratio(light[fg], light[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(GRAPHIC)('gráfico %s sobre %s llega a 3:1', (fg, bg) => {
    expect(ratio(light[fg], light[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe('colores de grupo', () => {
  it('todos los grupos tienen color', () => {
    for (const g of GROUPS) expect(groupColors[g.code]).toBeDefined();
  });
  it.each(GROUPS.map((g) => [g.code]))('%s: tinta sobre su tint y sobre blanco ≥ 4,5:1, icono ≥ 3:1', (code) => {
    const c = groupColors[code as keyof typeof groupColors];
    expect(ratio(c.ink, c.tint)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c.ink, light.surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c.color, light.surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(c.color, c.tint)).toBeGreaterThanOrEqual(3);
  });
});

describe('UICN', () => {
  it.each(Object.keys(iucnColors))('%s: texto oficial legible', (code) => {
    expect(ratio(iucnColors[code].fg, iucnColors[code].bg)).toBeGreaterThanOrEqual(4.5);
  });
});
