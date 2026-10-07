import { Directory, File, Paths } from 'expo-file-system';
import type { cv } from 'react-native-executorch';
import type { Image, RawPixelData } from 'react-native-nitro-image';
import type { Photo } from 'react-native-vision-camera';

import { embedPhoto, judge } from '@/ai/engine';
import type { Verdict } from '@/ai/decision';
import { squareInside, type Box } from '@/ai/frames';

import { traceStep } from './captureTrace';
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
  /** Vector de la foto recortada (para sugerir la raza sin volver a calcularlo). */
  embedding: Float32Array | null;
  /** Caja del animal en la foto, normalizada (0–1). */
  box: Box;
};

const SIGHTINGS = () => new Directory(Paths.document, 'avistamientos');
/** Lado máximo del recorte guardado (pegatina, cromo y revisión). */
const CROP_MAX = 1280;
/** Lado de la imagen que se pasa a la IA (el modelo la reescala a su entrada). */
const AI_SIDE = 448;

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

  traceStep('imagen');
  const image: Image = await photo.toImageAsync();
  photo.dispose();

  traceStep('guardar');
  const photoFile = new File(dir, `${id}.jpg`);
  // La calidad va de 0 a 100 (con 0,9 la foto salía casi sin calidad).
  await image.saveToFileAsync(photoFile.uri.replace('file://', ''), 'jpg', 90);

  // Cuadrado alrededor del animal con un margen, en píxeles enteros de la foto
  // (redondeando por separado inicio y fin, el recorte se salía un píxel y Android lo rechazaba).
  const W = image.width;
  const H = image.height;
  const sq = squareInside(box, W, H);
  traceStep('recorte');
  // Android devuelve la MISMA imagen si el recorte es la foto entera o el
  // tamaño no cambia: entonces no se suelta dos veces.
  const fullCrop = sq.side === W && sq.side === H ? image : await image.cropAsync(sq.x, sq.y, sq.x + sq.side, sq.y + sq.side);
  // La foto entera ya está en disco: se suelta su mapa de bits (12 MP, ~48 MB) sin esperar al recolector.
  if (fullCrop !== image) image.dispose();
  // El recorte se guarda a 1280 px como mucho: sobra para la pegatina y el cromo, y
  // el recorte de pegatinas del sistema no tiene que cargar una imagen de 3000 px.
  const crop = fullCrop.width > CROP_MAX ? await fullCrop.resizeAsync(CROP_MAX, CROP_MAX) : fullCrop;
  if (crop !== fullCrop) fullCrop.dispose();
  const small = crop.width === AI_SIDE && crop.height === AI_SIDE ? crop : await crop.resizeAsync(AI_SIDE, AI_SIDE);

  const cropFile = new File(dir, `${id}-recorte.jpg`);
  await crop.saveToFileAsync(cropFile.uri.replace('file://', ''), 'jpg', 92);
  if (small !== crop) crop.dispose();

  traceStep('ia');
  let verdict: Verdict | null = null;
  let embedding: Float32Array | null = null;
  const buffer = toImageBuffer(await small.toRawPixelDataAsync());
  small.dispose();
  if (buffer) {
    embedding = embedPhoto(buffer);
    if (embedding) verdict = judge(embedding, candidates);
  }

  traceStep('pegatina');
  const stickerFile = new File(dir, `${id}-pegatina.png`);
  // La pegatina es un extra: si el servicio de recorte del sistema tarda (la
  // primera vez se descarga), el fichaje sigue con la foto recortada.
  const sticker = await withTimeout(makeSticker(cropFile.uri, stickerFile.uri.replace('file://', ''), { x: 0.5, y: 0.5 }), 8000, 'pegatina').catch(
    () => null,
  );

  return {
    id,
    photoUri: photoFile.uri,
    cropUri: cropFile.uri,
    stickerUri: sticker?.uri ?? null,
    verdict,
    embedding,
    box: { x: sq.x / W, y: sq.y / H, w: sq.side / W, h: sq.side / H },
  };
}

/** Rechaza con `what` si la promesa no termina a tiempo (un paso colgado no bloquea el visor). */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(what)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
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
