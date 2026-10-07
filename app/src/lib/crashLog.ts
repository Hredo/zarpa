import { requireOptionalNativeModule } from 'expo';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { Alert, Share } from 'react-native';

import { crashText, exitAsCrash, pickCrash, type Crash, type ExitInfo } from './crashReport';

/*
 * Registro de cierres de la app.
 *
 * Si la app se cierra por un error, la próxima vez que se abre lo enseña con un
 * botón para compartirlo: así se sabe qué falló sin conectar el móvil al
 * ordenador. Recoge tres fuentes:
 *   - errores fatales de JavaScript y de los worklets (este fichero);
 *   - excepciones de Android sin atrapar y el motivo de cierre que guarda el
 *     sistema (fallo nativo, «no responde», memoria): modules/zarpa-crash.
 */

type CrashModule = { install(): boolean; lastExit(): ExitInfo | null };

const JS_FILE = 'ultimo-cierre.json';
const NATIVE_FILE = 'ultimo-cierre-nativo.json';
const SEEN_FILE = 'ultimo-cierre-visto.txt';

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = { getGlobalHandler(): ErrorHandler; setGlobalHandler(h: ErrorHandler): void };

function native(): CrashModule | null {
  try {
    return requireOptionalNativeModule<CrashModule>('ZarpaCrash');
  } catch {
    return null;
  }
}

let installed = false;

/** Empieza a apuntar los cierres. Va lo primero al cargar la app. */
export function installCrashLog(): void {
  if (installed) return;
  installed = true;
  try {
    native()?.install();
  } catch {
    // Sin el módulo (web, tests) solo se apuntan los errores de JS.
  }
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      const e = error instanceof Error ? error : new Error(String(error));
      // Síncrono: la app se cierra justo después.
      write(JS_FILE, JSON.stringify({ kind: 'js', message: `${e.name}: ${e.message}`, stack: (e.stack ?? '').slice(0, 8000), at: Date.now() }));
    }
    previous(error, isFatal);
  });
}

/** El cierre anterior que aún no se ha enseñado, o null. Lo marca como visto. */
export function takeLastCrash(): Crash | null {
  const seenAt = Number(read(SEEN_FILE) ?? 0) || 0;
  let exit: ExitInfo | null = null;
  try {
    exit = native()?.lastExit() ?? null;
  } catch {
    exit = null;
  }
  const crash = pickCrash(parse(read(JS_FILE)), parse(read(NATIVE_FILE)), exitAsCrash(exit), seenAt);
  remove(JS_FILE);
  remove(NATIVE_FILE);
  // También lo que Android guardó de ese mismo cierre queda como visto.
  const newest = Math.max(seenAt, crash?.at ?? 0, exit?.at ?? 0);
  if (newest > seenAt) write(SEEN_FILE, String(newest));
  return crash;
}

/** Al arrancar: si la app se cerró la última vez, lo cuenta y deja compartir el error. */
export function reportLastCrash(): void {
  const crash = takeLastCrash();
  if (!crash) return;
  const version = `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`;
  const text = crashText(crash, version);
  Alert.alert(
    'Zarpa se cerró la última vez',
    `${crash.message.slice(0, 400)}\n\nSi lo compartes con el equipo, se puede arreglar sin conectar el móvil a un ordenador.`,
    [
      { text: 'Cerrar', style: 'cancel' },
      { text: 'Compartir el error', onPress: () => void Share.share({ message: text }).catch(() => {}) },
    ],
  );
}

function file(name: string): File {
  return new File(Paths.document, name);
}

function read(name: string): string | null {
  try {
    const f = file(name);
    return f.exists ? f.textSync() : null;
  } catch {
    return null;
  }
}

function write(name: string, text: string): void {
  try {
    file(name).write(text);
  } catch {
    // El registro es una ayuda: si no se puede escribir, la app sigue igual.
  }
}

function remove(name: string): void {
  try {
    const f = file(name);
    if (f.exists) f.delete();
  } catch {
    // Nada que hacer.
  }
}

function parse(text: string | null): Crash | null {
  if (!text) return null;
  try {
    const c = JSON.parse(text) as Partial<Crash>;
    return typeof c.message === 'string' && typeof c.at === 'number' && (c.kind === 'js' || c.kind === 'native')
      ? { kind: c.kind, message: c.message, stack: typeof c.stack === 'string' ? c.stack : undefined, at: c.at }
      : null;
  } catch {
    return null;
  }
}
