import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import {
  createImageEmbedder,
  createObjectDetector,
  download,
  models,
  setTelemetryEnabled,
  type ImageEmbedder,
  type ObjectDetector,
} from 'react-native-executorch';
import { createSynchronizable } from 'react-native-worklets';
import { create } from 'zustand';

import { catalog, catalogReady } from '@/db';
import { ensureCountries } from '@/db/catalogDetail';
import { COUNTRY_MIN_OBS } from '@/db/query';
import { fileUri, fsPath } from '@/lib/urls';

import { BREED_MODEL, SPECIES_MODEL, type ModelSource } from './config';
import { decide, softmax, type Lineage, type Verdict } from './decision';
import { parseIndex, prepareQuery, scoreCandidates, type SpeciesIndex } from './speciesIndex';

/*
 * Motor de reconocimiento: carga los modelos una vez y los comparte con el visor.
 *
 * Todo lo que puede fallar en un móvil concreto (sin ExecuTorch para su CPU,
 * sin espacio, sin red al descargar) deja el motor en un estado explícito que
 * el visor enseña. Nunca se «finge» un reconocimiento.
 */

export type Load = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

type State = {
  detector: Load;
  detectorProgress: number;
  species: Load;
  speciesProgress: number;
  error: string | null;
};

export const useAI = create<State>(() => ({
  detector: 'idle',
  detectorProgress: 0,
  species: 'idle',
  speciesProgress: 0,
  error: null,
}));

type Detector = ObjectDetector<'xyxy', string>;

let detector: Detector | null = null;
let embedder: ImageEmbedder | null = null;
let index: SpeciesIndex | null = null;
let lineages: Map<number, Lineage> | null = null;
let breedIndex: SpeciesIndex | null = null;
let started = false;

/**
 * Cerrojo del modelo de especies. ExecuTorch reserva UNA vez los tensores de
 * entrada y salida del codificador y los reutiliza: si el visor en vivo (hilo
 * de la cámara) y el fichaje (foto en alta) lo usan a la vez, escriben en la
 * misma memoria nativa y la app se cierra. Todo uso del codificador pasa por
 * este cerrojo (un mutex de C++ compartido entre hilos).
 */
export const modelLock = createSynchronizable(0);

/**
 * Vector de la foto del fichaje, con el cerrojo del modelo. Corre en el hilo
 * de JS (espera, como mucho, a que termine el fotograma que se esté analizando).
 */
export function embedPhoto(input: Parameters<ImageEmbedder['embedWorklet']>[0]): Float32Array | null {
  const e = embedder;
  if (!e) return null;
  modelLock.lock();
  try {
    return e.embedWorklet(input);
  } finally {
    modelLock.unlock();
  }
}

/** El detector, si está listo (lo usa el hilo de la cámara). */
export const getDetector = () => detector;
/** El codificador de especies, si está listo. */
export const getEmbedder = () => embedder;

export async function startAI(): Promise<void> {
  if (started) return;
  started = true;
  // Las analíticas de descargas de la biblioteca van activadas por defecto; la
  // app no manda nada a terceros que el usuario no haya pedido.
  setTelemetryEnabled(false);
  await Promise.all([loadDetector(), loadSpecies()]);
}

/** Vuelve a intentar cargar lo que falló (sin red al bajar el detector, catálogo aún sin abrir…). */
export async function retryAI(): Promise<void> {
  const s = useAI.getState();
  const jobs: Promise<void>[] = [];
  if (s.detector === 'error') jobs.push(loadDetector());
  if (s.species === 'error') jobs.push(loadSpecies());
  await Promise.all(jobs);
}

async function loadDetector() {
  useAI.setState({ detector: 'loading' });
  try {
    const config = models.objectDetection.RFDETR_NANO.DEFAULT;
    const local = await download(config, {
      onProgress: (p) => useAI.setState({ detectorProgress: p }),
    });
    detector = (await createObjectDetector(local)) as unknown as Detector;
    useAI.setState({ detector: 'ready', detectorProgress: 1 });
  } catch (e) {
    useAI.setState({ detector: 'error', error: describe(e) });
  }
}

async function loadSpecies() {
  if (!SPECIES_MODEL) {
    useAI.setState({ species: 'missing' });
    return;
  }
  useAI.setState({ species: 'loading', error: null });
  try {
    // El linaje de cada especie sale del catálogo: si el usuario abre el visor
    // mientras aún se baja, se espera a que esté (antes la IA fallaba para siempre).
    await waitForCatalog();
    const [encoderPath, indexPath] = await Promise.all([
      resolveSource(SPECIES_MODEL.encoder, (p) => useAI.setState({ speciesProgress: p * 0.8 })),
      resolveSource(SPECIES_MODEL.index, (p) => useAI.setState({ speciesProgress: 0.8 + p * 0.2 })),
    ]);
    embedder ??= await createImageEmbedder({
      // ExecuTorch abre la ruta a secas: con `file:///…` (lo que da expo-asset)
      // respondía «AccessFailed» y la IA de especies no cargaba nunca.
      modelPath: fsPath(encoderPath),
      // La normalización de CLIP y la L2 van dentro del modelo exportado: la
      // biblioteca solo divide entre 255 (ver tools/zarpa_models/export_pte.py).
      modelOpts: { resizeMode: 'stretch', interpolation: 'linear', normalizeOpts: { alpha: 1 / 255, beta: 0 } },
    });
    const buffer = await new File(fileUri(indexPath)).arrayBuffer();
    index = parseIndex(buffer);
    if (!lineages) lineages = await loadLineages();
    if (BREED_MODEL) {
      // Las razas son un extra: si su índice falla, las especies siguen.
      try {
        const breedPath = await resolveSource(BREED_MODEL.index, () => {});
        breedIndex = parseIndex(await new File(fileUri(breedPath)).arrayBuffer());
      } catch {
        breedIndex = null;
      }
    }
    useAI.setState({ species: 'ready', speciesProgress: 1 });
  } catch (e) {
    useAI.setState({ species: 'error', error: describe(e) });
  }
}

async function waitForCatalog(timeoutMs = 120_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!catalogReady()) {
    if (Date.now() > until) throw new Error('el catálogo aún no está descargado');
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function resolveSource(source: ModelSource, onProgress: (p: number) => void): Promise<string> {
  if (source.kind === 'asset') {
    const asset = Asset.fromModule(source.module);
    await asset.downloadAsync();
    onProgress(1);
    if (!asset.localUri) throw new Error('No se pudo abrir el modelo empaquetado');
    return asset.localUri;
  }
  return download(source.url, { onProgress });
}

async function loadLineages(): Promise<Map<number, Lineage>> {
  const rows = await catalog().getAllAsync<{ id: number } & Lineage>(
    'SELECT id, class_sci AS class, order_sci AS "order", family_sci AS family, genus_sci AS genus FROM species_v',
  );
  return new Map(rows.map((r) => [r.id, { class: r.class, order: r.order, family: r.family, genus: r.genus }]));
}

const candidateCache = new Map<string, number[]>();

/**
 * Especies posibles en un país (observadas allí al menos COUNTRY_MIN_OBS veces).
 * Sin país, todas: menos preciso, pero nunca descarta al animal correcto.
 */
export async function candidatesFor(cc: string | null): Promise<number[] | undefined> {
  if (!cc) return undefined;
  const hit = candidateCache.get(cc);
  if (hit) return hit;
  // La lista del país se baja una vez; sin red (y sin bajar) se compara con todas.
  if (!(await ensureCountries([cc]))) return undefined;
  const rows = await catalog().getAllAsync<{ id: number }>('SELECT id FROM country WHERE cc = ? AND obs >= ?', [
    cc,
    COUNTRY_MIN_OBS,
  ]);
  const ids = rows.map((r) => r.id);
  // Un país sin datos (o con muy pocos) no debe dejar al motor sin candidatos.
  if (ids.length < 50) return undefined;
  candidateCache.set(cc, ids);
  return ids;
}

/** Del vector de una imagen a un veredicto honesto (ver `decision.ts`). */
export function judge(embedding: Float32Array, candidates?: number[]): Verdict | null {
  if (!index || !lineages || !SPECIES_MODEL) return null;
  const scored = scoreCandidates(index, prepareQuery(index, embedding), candidates);
  const probs = softmax(scored);
  return decide(probs, (id) => lineages!.get(id), SPECIES_MODEL.thresholds);
}

export type BreedGuess = { rid: number; p: number };

/**
 * Raza más probable entre las de la especie (perro, gato…), con probabilidad
 * calibrada. `sure` solo si supera el umbral con el que acierta ≥95 %; si no,
 * la app la enseña como sugerencia y decide la persona.
 */
export async function judgeBreed(
  embedding: Float32Array,
  speciesId: number,
): Promise<{ top: BreedGuess[]; sure: BreedGuess | null } | null> {
  if (!breedIndex || !BREED_MODEL) return null;
  const rows = await catalog().getAllAsync<{ rid: number }>('SELECT rid FROM breed WHERE species_id = ?', [speciesId]);
  const scored = scoreCandidates(breedIndex, prepareQuery(breedIndex, embedding), rows.map((r) => r.rid));
  if (scored.length < 2) return null;
  const probs = softmax(scored);
  const top = probs.slice(0, 3).map((c) => ({ rid: c.id, p: c.p }));
  return { top, sure: top[0].p >= BREED_MODEL.threshold ? top[0] : null };
}

export function speciesModelId(): string | null {
  return SPECIES_MODEL?.id ?? null;
}

function describe(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}
