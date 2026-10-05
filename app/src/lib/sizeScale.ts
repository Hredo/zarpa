/*
 * Tamaño frente a una referencia conocida (moneda, mano, persona). Lógica pura:
 * la pantalla solo dibuja lo que sale de aquí. Los tamaños del animal vienen
 * del catálogo (mass_g, length_mm; etapa `size` de tools/); las referencias son
 * medidas medias de un objeto o un adulto y se presentan como aproximadas.
 */

export type SizeKind = 'length' | 'mass';

export type RefKey = 'coin' | 'hand' | 'person' | 'sugar';

export type Reference = {
  key: RefKey;
  /** «una moneda de 2 €», con artículo, para frases. */
  label: string;
  /** Forma corta para rótulos de la barra. */
  short: string;
  /** Valor en mm (longitud) o g (masa). */
  value: number;
  /** Cómo se explica la medida de la referencia («altura», «diámetro»). */
  note: string;
};

export const LENGTH_REFS: Reference[] = [
  { key: 'coin', label: 'una moneda de 2 €', short: 'Moneda de 2 €', value: 25.75, note: 'diámetro' },
  { key: 'hand', label: 'tu mano', short: 'Una mano', value: 180, note: 'de la muñeca a la punta del dedo' },
  { key: 'person', label: 'una persona', short: 'Una persona', value: 1700, note: 'altura media de un adulto' },
];

export const MASS_REFS: Reference[] = [
  { key: 'coin', label: 'una moneda de 2 €', short: 'Moneda de 2 €', value: 8.5, note: 'peso' },
  { key: 'sugar', label: 'un paquete de azúcar', short: 'Paquete de azúcar', value: 1000, note: '1 kg' },
  { key: 'person', label: 'una persona', short: 'Una persona', value: 70000, note: 'peso medio de un adulto' },
];

/** Referencia más cercana (en escala logarítmica) al valor del animal. */
export function pickReference(kind: SizeKind, value: number): Reference {
  const refs = kind === 'length' ? LENGTH_REFS : MASS_REFS;
  let best = refs[0];
  let bestDist = Infinity;
  for (const r of refs) {
    const d = Math.abs(Math.log(value / r.value));
    if (d < bestDist) {
      best = r;
      bestDist = d;
    }
  }
  return best;
}

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

/** 0,5 g · 12 g · 3,4 kg · 4,2 t */
export function formatMass(g: number): string {
  if (g < 10) return `${nf.format(g)} g`;
  if (g < 1000) return `${nf0.format(g)} g`;
  if (g < 1_000_000) return `${nf.format(g / 1000)} kg`;
  return `${nf.format(g / 1_000_000)} t`;
}

/** 3 mm · 12 cm · 1,7 m · 24 m */
export function formatLength(mm: number): string {
  if (mm < 10) return `${nf.format(mm)} mm`;
  if (mm < 1000) return `${mm < 100 ? nf.format(mm / 10) : nf0.format(mm / 10)} cm`;
  return `${nf.format(mm / 1000)} m`;
}

export function formatSize(kind: SizeKind, value: number): string {
  return kind === 'length' ? formatLength(value) : formatMass(value);
}

/** Anchuras relativas (0–1) de las dos barras: la mayor ocupa todo, la menor nunca desaparece. */
export function barFractions(animal: number, ref: number, min = 0.025): { animal: number; ref: number } {
  const max = Math.max(animal, ref);
  return {
    animal: Math.max(min, animal / max),
    ref: Math.max(min, ref / max),
  };
}

function times(n: number): string {
  if (n >= 10) return nf0.format(Math.round(n));
  return nf.format(Math.round(n * 10) / 10);
}

/** «Casi igual que una persona», «3 veces más larga que tu mano»… */
export function ratioPhrase(kind: SizeKind, animal: number, ref: Reference): string {
  const r = animal / ref.value;
  if (r >= 0.85 && r <= 1.18) return `Casi igual que ${ref.label}`;
  if (r > 1) return `${times(r)} veces más ${kind === 'length' ? 'larga' : 'pesada'} que ${ref.label}`;
  return `${times(1 / r)} veces más ${kind === 'length' ? 'corta' : 'ligera'} que ${ref.label}`;
}

export type SizeInput = { mass_g?: number | null; length_mm?: number | null };

/** Qué magnitud se dibuja: la longitud si existe, si no la masa; null si no hay ninguna. */
export function sizeKindOf(s: SizeInput): { kind: SizeKind; value: number } | null {
  if (s.length_mm != null && s.length_mm > 0) return { kind: 'length', value: s.length_mm };
  if (s.mass_g != null && s.mass_g > 0) return { kind: 'mass', value: s.mass_g };
  return null;
}
