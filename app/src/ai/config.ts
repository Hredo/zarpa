import type { Thresholds } from './decision';
import { DEFAULT_THRESHOLDS } from './decision';

/*
 * Qué modelos usa el reconocimiento y de dónde salen.
 *
 * - **Detector** (dónde hay un animal en el encuadre): RF-DETR Nano entrenado en
 *   COCO, publicado por Software Mansion para React Native ExecuTorch (licencia
 *   Apache 2.0). Reconoce diez clases de animales (ave, gato, perro, caballo,
 *   oveja, vaca, elefante, oso, cebra, jirafa): basta para encuadrar al animal
 *   y seguirlo; la especie la decide el segundo modelo.
 * - **Especie**: el codificador de imagen de BioCLIP (Imageomics, licencia MIT),
 *   exportado a ExecuTorch por `tools/zarpa_models/export_pte.py`, y el índice de
 *   especies que genera `build_index.py`. Se comparan los dos en el móvil.
 *
 * `SPECIES_MODEL` admite un recurso empaquetado en la app o una URL. Mientras no
 * esté publicado (`null`), el visor funciona igual pero en modo «sin IA de
 * especies»: encuadra, fotografía y deja elegir la especie a mano, marcando el
 * avistamiento como no verificado.
 */

export type ModelSource = { kind: 'asset'; module: number } | { kind: 'url'; url: string };

export type SpeciesModel = {
  id: string;
  encoder: ModelSource;
  index: ModelSource;
  thresholds: Thresholds;
  /** Lado de la imagen de entrada del codificador (cuadrada). */
  inputSize: number;
};

export const SPECIES_MODEL: SpeciesModel | null = null;

export const FALLBACK_THRESHOLDS = DEFAULT_THRESHOLDS;

/** Clases de COCO que son animales (el detector también ve personas y objetos). */
export const COCO_ANIMALS = new Set(['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe']);
