/*
 * Qué cámara trasera usar y qué objetivos ofrecer.
 *
 * La principal es la predeterminada del sistema: en Android es la cámara
 * lógica que ya combina ultra gran angular, gran angular y tele, con todo su
 * zoom (0,5× a 10×, 30×, 100×…). El filtro `physicalDevices` de VisionCamera
 * no sirve en Android (allí todas las lentes físicas son `unknown`, el filtro
 * las puntúa en contra y acababa eligiendo una cámara de un solo objetivo con
 * zoom de 1× a 2×).
 *
 * Algunos fabricantes publican el ultra gran angular o el tele como cámaras
 * sueltas: si la principal no los cubre, se ofrecen como objetivos aparte.
 *
 * Leer propiedades de una cámara que la app no va a usar puede lanzar una
 * excepción nativa en algunos móviles (el tipo se calcula con CameraX): toda
 * lectura va protegida y, ante la duda, esa cámara simplemente no se ofrece.
 */

export type CamInfo = {
  id: string;
  position: string;
  type: string;
  minZoom: number;
  maxZoom: number;
  physicalDevices: readonly unknown[];
};

export type Lens = { id: string; kind: 'ultra' | 'tele' };

/** Lee una propiedad nativa sin dejar que una excepción tumbe la pantalla. */
export function safe<T>(read: () => T, fallback: T): T {
  try {
    const v = read();
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/** Zoom mínimo y máximo fiables (0 = la cámara aún no lo ha dicho). */
export function zoomRange(d: Pick<CamInfo, 'minZoom' | 'maxZoom'>): { min: number; max: number } {
  const rawMin = safe(() => d.minZoom, 0);
  const rawMax = safe(() => d.maxZoom, 0);
  const min = rawMin > 0 ? rawMin : 1;
  const max = rawMax > 0 ? Math.max(min, rawMax) : min;
  return { min, max };
}

/**
 * Objetivos sueltos que añaden algo a la cámara principal: un ultra gran
 * angular si la principal no baja de 1×, un tele si la principal es de un
 * solo objetivo (su zoom es solo digital).
 */
export function extraLenses(main: CamInfo | undefined, devices: readonly CamInfo[], position = 'back'): Lens[] {
  if (!main) return [];
  const mainId = safe(() => main.id, '');
  const others = devices.filter((d) => safe(() => d.position, '') === position && safe(() => d.id, mainId) !== mainId);
  if (others.length === 0) return [];
  const lenses: Lens[] = [];
  const ultra = others.find((d) => safe(() => d.type, 'unknown') === 'ultra-wide-angle');
  if (ultra && zoomRange(main).min >= 0.95) lenses.push({ id: ultra.id, kind: 'ultra' });
  const tele = others.find((d) => safe(() => d.type, 'unknown') === 'telephoto');
  if (tele && safe(() => main.physicalDevices.length, 1) <= 1) lenses.push({ id: tele.id, kind: 'tele' });
  return lenses;
}

/**
 * Atajos de zoom (en la escala que ve el usuario: 1× = gran angular principal).
 * Incluye el mínimo (ultra gran angular), los cambios de objetivo que anuncie
 * la cámara, los saltos habituales y el máximo real del móvil.
 */
export function zoomPresets(min: number, max: number, base: number, switchFactors: readonly number[] = []): number[] {
  const round = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
  const lo = round(min / base);
  const hi = round(max / base);
  // Por prioridad: extremos y 1× siempre; luego 2×, los objetivos reales y los saltos redondos.
  const wanted = [lo, 1, hi, 2, ...switchFactors.map((f) => round(f / base)), 10, 5, 30, 100];
  const out: number[] = [];
  for (const v of wanted) {
    if (out.length >= 6) break;
    if (v < lo - 0.001 || v > hi + 0.001) continue;
    if (out.some((o) => Math.abs(o - v) / Math.max(o, v) < 0.15)) continue;
    out.push(v);
  }
  return out.sort((a, b) => a - b);
}

/** «0,5×», «1×», «2,5×», «30×». */
export function zoomLabel(v: number): string {
  const r = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${String(r).replace('.', ',')}×`;
}

/*
 * Errores de la cámara que no son fallos: CameraX rechaza un zoom si la cámara
 * aún no está activa (pasa siempre al abrir el visor) o si llega otro antes de
 * terminar (al pellizcar o animar el zoom). Enseñarlos tapaba el visor con una
 * traza de Java sin que nada fuera mal.
 */
const BENIGN_CAMERA_ERROR = /OperationCanceledException|Camera is not active|Cancelled by another/i;

/**
 * Frase corta para el aviso del visor a partir del mensaje de un error nativo
 * (que trae la pila de Java detrás), o null si no hay que enseñarlo.
 */
export function cameraErrorText(message: string | undefined | null): string | null {
  const text = (message ?? '').trim();
  if (!text || BENIGN_CAMERA_ERROR.test(text)) return null;
  const first = (text.split('\n')[0] ?? '')
    .replace(/\s+at\s+[\w$.]+\(.*$/, '')
    .replace(/^(?:[\w$]+\.)*[\w$]*(?:Error|Exception):\s*/, '')
    .trim();
  const line = first || text.slice(0, 160);
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}
