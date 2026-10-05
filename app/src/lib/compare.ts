/* Lógica pura de la pantalla «Comparar» (sin React ni base de datos). */

/** Etiquetas de una máscara de bits (medios, ambientes), en el orden de la tabla. */
export function maskLabels(mask: number, table: readonly { bit: number; label: string }[]): string[] {
  return table.filter((t) => (mask & t.bit) !== 0).map((t) => t.label);
}

export type SetSplit = { both: string[]; onlyA: string[]; onlyB: string[] };

/** En común / solo de A / solo de B, conservando el orden de entrada. */
export function splitSets(a: readonly string[], b: readonly string[]): SetSplit {
  const inB = new Set(b);
  const inA = new Set(a);
  return {
    both: a.filter((x) => inB.has(x)),
    onlyA: a.filter((x) => !inB.has(x)),
    onlyB: b.filter((x) => !inA.has(x)),
  };
}

/** Recorta una lista larga: «a, b, c y 4 más». */
export function summarizeList(items: readonly string[], max = 8): string {
  if (items.length === 0) return '';
  if (items.length <= max) return items.join(', ');
  const rest = items.length - max;
  return `${items.slice(0, max).join(', ')} y ${rest} más`;
}

/** Qué lado gana en una cifra (para destacar): 'a' · 'b' · null si empatan o falta un dato. */
export function higher(a: number | null | undefined, b: number | null | undefined): 'a' | 'b' | null {
  if (a == null || b == null || a === b) return null;
  return a > b ? 'a' : 'b';
}
