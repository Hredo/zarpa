import { File, Paths } from 'expo-file-system';

/*
 * Traza del último fichaje, para poder explicar un cierre de la app.
 *
 * Si la app muere en código nativo (cámara, IA, recorte), JavaScript no llega a
 * enterarse. Por eso cada paso del fichaje se apunta en un fichero de forma
 * síncrona antes de empezarlo: si al volver al visor el último paso no es
 * «listo», la app se cerró en ese paso y el visor lo dice. Así se sabe qué
 * falló sin conectar el móvil a un ordenador.
 */

export type CaptureStep = 'foto' | 'imagen' | 'guardar' | 'recorte' | 'ia' | 'pegatina' | 'revision' | 'listo';

const STEP_ES: Record<CaptureStep, string> = {
  foto: 'al hacer la foto',
  imagen: 'al revelar la foto',
  guardar: 'al guardar la foto',
  recorte: 'al recortar el animal',
  ia: 'al reconocer la especie',
  pegatina: 'al crear la pegatina',
  revision: 'al enseñar el resultado',
  listo: '',
};

const traceFile = () => new File(Paths.document, 'ultimo-fichaje.json');

/** Apunta el paso que va a empezar (síncrono: queda escrito aunque la app muera justo después). */
export function traceStep(step: CaptureStep): void {
  try {
    traceFile().write(JSON.stringify({ step, at: new Date().toISOString() }));
  } catch {
    // La traza es una ayuda: si no se puede escribir, el fichaje sigue.
  }
}

/**
 * Si el último fichaje no terminó (la app se cerró a medias), devuelve en qué
 * paso, en palabras, y borra la traza. `null` si terminó bien o no hay traza.
 */
export function takeCrashedStep(): string | null {
  try {
    const f = traceFile();
    if (!f.exists) return null;
    const { step } = JSON.parse(f.textSync()) as { step: CaptureStep };
    f.delete();
    return step && step !== 'listo' ? (STEP_ES[step] ?? step) : null;
  } catch {
    return null;
  }
}
