/* Geometría pura del cromo para compartir (la pinta shareCard.ts con Skia). */

export type Rect = { x: number; y: number; width: number; height: number };

/** Origen del recorte de la imagen para cubrir `dst` sin deformarla (como `cover`). */
export function coverSrc(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const w = dstW / scale;
  const h = dstH / scale;
  return { x: (srcW - w) / 2, y: (srcH - h) / 2, width: w, height: h };
}

/** Rectángulo destino para meter la imagen entera dentro de `dst` (como `contain`), centrada. */
export function containDst(srcW: number, srcH: number, dst: Rect): Rect {
  const scale = Math.min(dst.width / srcW, dst.height / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return { x: dst.x + (dst.width - width) / 2, y: dst.y + (dst.height - height) / 2, width, height };
}

/** Acorta con «…» hasta que `measure(texto)` cabe en `maxW`. */
export function ellipsize(text: string, measure: (t: string) => number, maxW: number): string {
  if (measure(text) <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${text.slice(0, mid).trimEnd()}…`) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

/** Mayor tamaño de letra (entre `min` y `max`, de 2 en 2) con el que el texto cabe en `maxW`. */
export function fitFontSize(measureAt: (size: number) => number, maxW: number, max: number, min: number): number {
  for (let size = max; size > min; size -= 2) {
    if (measureAt(size) <= maxW) return size;
  }
  return min;
}

/** Posición de la categoría UICN en la escala del cromo (-1 si no está en la escala). */
export const CARD_IUCN_SCALE = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX'] as const;
export function iucnIndex(code: string | null | undefined): number {
  return code ? CARD_IUCN_SCALE.indexOf(code as (typeof CARD_IUCN_SCALE)[number]) : -1;
}

export const CARD_W = 1080;
export const CARD_H = 1350;
