import { light, type Palette } from './tokens';

export * from './tokens';

/**
 * Paleta activa. Zarpa es siempre clara (decisión de Hugo, 2026-10-05): no
 * sigue al tema oscuro del sistema. Se mantiene como hook para que, si algún
 * día vuelve un modo oscuro, ningún componente tenga que cambiar.
 */
export function usePalette(): Palette {
  return light;
}
