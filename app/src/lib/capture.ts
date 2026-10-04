import { Directory, File, Paths } from 'expo-file-system';
import type { cv } from 'react-native-executorch';
import type { Image, RawPixelData } from 'react-native-nitro-image';
import type { Photo } from 'react-native-vision-camera';

import { getEmbedder, judge } from '@/ai/engine';
import type { Verdict } from '@/ai/decision';
import type { Box } from '@/ai/frames';

import { makeSticker } from './cutout';

type ImageBuffer = cv.ImageBuffer;

/*
 * Del disparo al material del fichaje: foto completa, recorte del animal,
 * veredicto de la IA sobre el recorte en alta resolución y pegatina.
 *
 * El veredicto final no reutiliza el del visor: se calcula otra vez sobre la
 * foto de verdad (más nítida que el fotograma de previsualización), que es la
 * que queda como prueba del avistamiento.
 */

export type CaptureResult = {
  id: string;
  photoUri: string;
  cropUri: string;
  stickerUri: string | null;
  verdict: Verdict | null;
  /** Caja del animal en la foto, normalizada (0–1). */
  box: Box;
};

const SIGHTINGS = () => new Directory(Paths.document, 'avistamientos');

function toImageBuffer(raw: RawPixelData): ImageBuffer | null {
  const bytes = new Uint8Array(raw.buffer);
  const px = raw.width * raw.height;
  const fmt = raw.pixelFormat;
  if ((fmt === 'RGBA' || fmt === 'RGBX') && bytes.length === px * 4) {
    return { data: bytes, width: raw.width, height: raw.height, format: 'rgba', layout: 'hwc' };
  }
  if ((fmt === 'BGRA' || fmt === 'BGRX') && bytes.length === px * 4) {
    return { data: bytes, width: raw.width, height: raw.height, format: 'bgra', layout: 'hwc' };
  }
  if (fmt === 'RGB' && bytes.length === px * 3) {
    return { data: bytes, width: raw.width, height: raw.height, format: 'rgb', layout: 'hwc' };
  }
  if (fmt === 'BGR' && bytes.length === px * 3) {
    return { data: bytes, width: raw.width, height: raw.height, format: 'bgr', layout: 'hwc' };
  }
  if ((fmt === 'ARGB' || fmt === 'XRGB') && bytes.length === px * 4) {
    // Reordenar a RGBA: es raro (algunas versiones de Android) y la imagen ya
    // está reducida a 448 px, así que el bucle cuesta milisegundos.
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 4) {
      out[i] = bytes[i + 1];
      out[i + 1] = bytes[i + 2];
      out[i + 2] = bytes[i + 3];
      out[i + 3] = bytes[i];
    }
    return { data: out, width: raw.width, height: raw.height, format: 'rgba', layout: 'hwc' };
  }
  return null;
}

/**
 * Procesa un disparo. `box` es la caja del animal normalizada al fotograma del
 * visor; foto y fotograma son 4:3 y ya vienen derechos, así que la misma caja
 * normalizada vale en los dos.
 */
export async function processCapture(
  photo: Photo,
  box: Box,
  candidates: number[] | undefined,
  id: string,
): Promise<CaptureResult> {
  const dir = SIGHTINGS();
  if (!dir.exists) dir.create({ intermediates: true });

  const image: Image = await photo.toImageAsync();
  photo.dispose();

  const photoFile = new File(dir, `${id}.jpg`);
  await image.saveToFileAsync(photoFile.uri.replace('file://', ''), 'jpg', 0.9);

  // Cuadrado alrededor del animal con un margen, en píxeles de la foto.
  const W = image.width;
  const H = image.height;
  const cx = (box.x + box.w / 2) * W;
  const cy = (box.y + box.h / 2) * H;
  let side = Math.max(box.w * W, box.h * H) * 1.36;
  side = Math.min(side, W, H);
  const x0 = Math.min(Math.max(0, cx - side / 2), W - side);
  const y0 = Math.min(Math.max(0, cy - side / 2), H - side);
  const crop = await image.cropAsync(Math.round(x0), Math.round(y0), Math.round(x0 + side), Math.round(y0 + side));
  const small = await crop.resizeAsync(448, 448);

  const cropFile = new File(dir, `${id}-recorte.jpg`);
  await crop.saveToFileAsync(cropFile.uri.replace('file://', ''), 'jpg', 0.92);

  let verdict: Verdict | null = null;
  const embedder = getEmbedder();
  if (embedder) {
    const buffer = toImageBuffer(await small.toRawPixelDataAsync());
    if (buffer) {
      const embedding = await embedder.embed(buffer);
      verdict = judge(embedding, candidates);
    }
  }

  const stickerFile = new File(dir, `${id}-pegatina.png`);
  const sticker = await makeSticker(cropFile.uri, stickerFile.uri.replace('file://', ''), { x: 0.5, y: 0.5 });

  return {
    id,
    photoUri: photoFile.uri,
    cropUri: cropFile.uri,
    stickerUri: sticker?.uri ?? null,
    verdict,
    box: { x: x0 / W, y: y0 / H, w: side / W, h: side / H },
  };
}

/** Borra los ficheros de un disparo que el usuario descartó. */
export function discardCapture(c: Pick<CaptureResult, 'photoUri' | 'cropUri' | 'stickerUri'>): void {
  for (const uri of [c.photoUri, c.cropUri, c.stickerUri]) {
    if (!uri) continue;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // Un fichero huérfano en la carpeta de la app no rompe nada.
    }
  }
}
