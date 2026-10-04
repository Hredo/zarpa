/*
 * Índice de especies para el reconocimiento.
 *
 * Fichero binario que genera `tools/zarpa_models/build_index.py` con el
 * codificador de texto de BioCLIP (y, cuando hay fotos de referencia
 * verificadas, la media de sus vectores de imagen):
 *
 *   0   'ZIDX'                 magia
 *   4   uint32 versión
 *   8   uint32 dimensión D
 *   12  uint32 número de especies N
 *   16  float32 escala del logit (la temperatura calibrada ya aplicada)
 *   20  int32[N]  id de especie (taxón de iNaturalist, igual que el catálogo)
 *   ..  float32[N] escala de cuantización de cada vector
 *   ..  int8[N*D] vectores normalizados y cuantizados (v ≈ q * escala)
 *
 * int8 por espacio: 97 000 especies × 768 dimensiones son 74 MB así y 298 MB en
 * float32. La pérdida de precisión de la cuantización por vector es medida en
 * `tools/zarpa_models/evaluate.py` (el top-1 no cambia en el banco de pruebas).
 */

export type SpeciesIndex = {
  version: number;
  dim: number;
  count: number;
  logitScale: number;
  ids: Int32Array;
  scales: Float32Array;
  vectors: Int8Array;
  /** Posición de cada id en las matrices. */
  position: Map<number, number>;
};

const MAGIC = 0x5844495a; // 'ZIDX' en little-endian

export function parseIndex(buffer: ArrayBuffer): SpeciesIndex {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Índice de especies con formato desconocido');
  const version = view.getUint32(4, true);
  const dim = view.getUint32(8, true);
  const count = view.getUint32(12, true);
  const logitScale = view.getFloat32(16, true);
  let offset = 20;
  const ids = new Int32Array(buffer.slice(offset, offset + count * 4));
  offset += count * 4;
  const scales = new Float32Array(buffer.slice(offset, offset + count * 4));
  offset += count * 4;
  const vectors = new Int8Array(buffer, offset, count * dim);
  if (offset + count * dim > buffer.byteLength) throw new Error('Índice de especies truncado');
  const position = new Map<number, number>();
  for (let i = 0; i < count; i++) position.set(ids[i], i);
  return { version, dim, count, logitScale, ids, scales, vectors, position };
}

export type Scored = { id: number; logit: number };

/**
 * Producto escalar del vector de la imagen contra los candidatos.
 *
 * `candidates` restringe la búsqueda a las especies posibles (las que se ven en
 * el país del usuario): es lo que más precisión aporta, porque descarta de
 * antemano los parecidos de otros continentes. Sin candidatos, se compara con
 * todas.
 */
export function scoreCandidates(index: SpeciesIndex, embedding: Float32Array, candidates?: Iterable<number>): Scored[] {
  const { dim, vectors, scales, logitScale, ids } = index;
  const out: Scored[] = [];
  const score = (row: number) => {
    let acc = 0;
    const base = row * dim;
    for (let k = 0; k < dim; k++) acc += vectors[base + k] * embedding[k];
    return acc * scales[row] * logitScale;
  };
  if (candidates) {
    for (const id of candidates) {
      const row = index.position.get(id);
      if (row !== undefined) out.push({ id, logit: score(row) });
    }
  } else {
    for (let row = 0; row < index.count; row++) out.push({ id: ids[row], logit: score(row) });
  }
  return out;
}

/** Normaliza a longitud 1 (el modelo exportado ya lo hace; esto es la red de seguridad). */
export function l2normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}
