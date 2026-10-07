import type { cv } from 'react-native-executorch';

type ImageBuffer = cv.ImageBuffer;

/*
 * Utilidades de píxeles que corren en el hilo de la cámara (worklets).
 *
 * Los fotogramas llegan en RGBA (Android) o BGRA (iOS), a veces con relleno al
 * final de cada fila (`bytesPerRow` > ancho × 4). ExecuTorch espera una matriz
 * HWC compacta, así que se copia fila a fila solo cuando hay relleno, y para
 * recortar el animal se copia solo la ventana que interesa: nunca se recorre la
 * imagen píxel a píxel en JS.
 */

export type Box = { x: number; y: number; w: number; h: number };

export function channelsOf(format: string): number {
  'worklet';
  return format === 'rgb-rgb-8-bit' ? 3 : 4;
}

export function imageFormatOf(format: string): ImageBuffer['format'] {
  'worklet';
  if (format === 'rgb-bgra-8-bit') return 'bgra';
  if (format === 'rgb-rgb-8-bit') return 'rgb';
  return 'rgba';
}

/** Ventana [x, y, w, h] de un búfer con `stride` bytes por fila, compactada. */
export function cropBuffer(
  src: Uint8Array,
  stride: number,
  channels: number,
  box: Box,
): Uint8Array {
  'worklet';
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.max(1, Math.floor(box.w));
  const h = Math.max(1, Math.floor(box.h));
  const rowBytes = w * channels;
  const out = new Uint8Array(rowBytes * h);
  for (let row = 0; row < h; row++) {
    const start = (y + row) * stride + x * channels;
    out.set(src.subarray(start, start + rowBytes), row * rowBytes);
  }
  return out;
}

/**
 * Cuadrado centrado en la caja del animal, con margen: el modelo de especies
 * se entrenó con el animal ocupando buena parte de la foto pero no toda.
 * Se recorta al tamaño del fotograma.
 */
export function squareAround(box: Box, frameW: number, frameH: number, margin = 0.18): Box {
  'worklet';
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let side = Math.max(box.w, box.h) * (1 + margin * 2);
  side = Math.min(side, frameW, frameH);
  let x = cx - side / 2;
  let y = cy - side / 2;
  x = Math.min(Math.max(0, x), frameW - side);
  y = Math.min(Math.max(0, y), frameH - side);
  return { x, y, w: side, h: side };
}

/** Sin detección, el animal es lo que hay bajo la retícula: el centro. */
export function centerSquare(frameW: number, frameH: number, fraction = 0.62): Box {
  'worklet';
  const side = Math.min(frameW, frameH) * fraction;
  return { x: (frameW - side) / 2, y: (frameH - side) / 2, w: side, h: side };
}

/** Caja en píxeles del fotograma → caja en puntos de la vista (relleno «cover»). */
export function frameBoxToView(box: Box, frameW: number, frameH: number, viewW: number, viewH: number): Box {
  'worklet';
  const scale = Math.max(viewW / frameW, viewH / frameH);
  const offX = (viewW - frameW * scale) / 2;
  const offY = (viewH - frameH * scale) / 2;
  return { x: box.x * scale + offX, y: box.y * scale + offY, w: box.w * scale, h: box.h * scale };
}

/**
 * Cuadrado alrededor del animal con un 36 % de margen, en píxeles enteros y
 * siempre dentro de la foto. `box` va normalizada (0–1).
 */
export function squareInside(box: Box, W: number, H: number): { x: number; y: number; side: number } {
  const side = Math.max(1, Math.floor(Math.min(Math.max(box.w * W, box.h * H) * 1.36, W, H)));
  const cx = (box.x + box.w / 2) * W;
  const cy = (box.y + box.h / 2) * H;
  const x = Math.min(Math.max(0, Math.round(cx - side / 2)), W - side);
  const y = Math.min(Math.max(0, Math.round(cy - side / 2)), H - side);
  return { x, y, side };
}
