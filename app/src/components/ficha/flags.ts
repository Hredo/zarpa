/** Bandera de un país a partir de su código ISO de dos letras; '' si no lo es. */
export function flagOf(cc: string): string {
  if (!/^[A-Za-z]{2}$/.test(cc)) return '';
  const base = 0x1f1e6;
  const up = cc.toUpperCase();
  return String.fromCodePoint(base + up.charCodeAt(0) - 65, base + up.charCodeAt(1) - 65);
}
