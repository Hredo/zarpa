import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, DownloadTask, File } from 'expo-file-system';
import * as Network from 'expo-network';
import * as SQLite from 'expo-sqlite';
import { create } from 'zustand';

import { CATALOG_SCHEMA, catalogUrl, isNewerCatalog, parseManifest, type CatalogInfo, type CatalogManifest } from './catalogRemote';

/*
 * El índice del catálogo en el móvil: primera descarga y actualizaciones.
 *
 * La app no lleva el catálogo dentro: al abrirse por primera vez baja de
 * Firebase Hosting el índice ligero (`installLatestCatalog`, con progreso en
 * la pantalla de arranque). Después, una vez al día y con wifi (o al pulsar
 * «Buscar actualización» en el perfil), mira `c/manifest.json`; si hay un
 * índice más nuevo de su esquema:
 *   1. lo baja a `indice-<versión>.db.part`. Se pide el `indice.db` sin
 *      comprimir: Hosting lo comprime él solo al servirlo (~15-19 MB por la
 *      red) y el móvil lo recibe ya descomprimido. El `.gz` del manifiesto no
 *      sirve: Hosting no deja poner `Content-Encoding` a mano y llegaría
 *      comprimido al disco;
 *   2. comprueba el MD5 y lo renombra a `indice-<versión>.db`;
 *   3. lo anota en `catalogo-activo.json` y se usa al volver a abrir la app
 *      (cambiarlo en caliente dejaría consultas a medias con la base vieja).
 */

const ACTIVE_FILE = 'catalogo-activo.json';
const LAST_CHECK_KEY = 'zarpa-catalog-last-check';
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
export const INDEX_PREFIX = 'indice-';

export type ActiveCatalog = CatalogInfo & { file: string; md5: string };

type Phase =
  | 'idle'
  | 'checking'
  /** Al día. */
  | 'uptodate'
  /** Hay uno nuevo, pero sin wifi no se baja solo. */
  | 'available'
  | 'downloading'
  | 'verifying'
  /** Bajado y comprobado: se usará al volver a abrir la app. */
  | 'ready'
  | 'offline'
  | 'error';

type State = {
  phase: Phase;
  /** 0–1 durante la descarga. */
  progress: number;
  remote: CatalogManifest | null;
  checkedAt: string | null;
  error: string | null;
};

export const useCatalogUpdate = create<State>(() => ({ phase: 'idle', progress: 0, remote: null, checkedAt: null, error: null }));

/** No hay red (o no responde Hosting): la primera descarga no puede hacerse. */
export class CatalogOffline extends Error {
  constructor() {
    super('Sin conexión');
    this.name = 'CatalogOffline';
  }
}

/**
 * Carpeta de las bases de SQLite. `defaultDatabaseDirectory` es una ruta
 * («/data/user/0/…/files/SQLite») y expo-file-system necesita una URI
 * (`file:///…`): con la ruta a secas, cualquier operación con el fichero falla.
 */
export function dbDir(): Directory {
  const path = SQLite.defaultDatabaseDirectory;
  const dir = new Directory(path.startsWith('file:') ? path : `file://${path}`);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** El índice anotado como activo, si sigue en disco y es del esquema de la app. */
export function readActiveCatalog(): ActiveCatalog | null {
  try {
    const f = new File(dbDir(), ACTIVE_FILE);
    if (!f.exists) return null;
    const info = JSON.parse(f.textSync()) as ActiveCatalog;
    if (!info?.file || info.schema !== CATALOG_SCHEMA || !new File(dbDir(), info.file).exists) return null;
    return info;
  } catch {
    return null;
  }
}

/** Olvida el índice activo (p. ej. si no abre): se volverá a bajar. */
export function forgetActiveCatalog(): void {
  try {
    const f = new File(dbDir(), ACTIVE_FILE);
    if (f.exists) f.delete();
  } catch {
    // Sin el fichero, el próximo arranque baja el índice otra vez.
  }
}

let installed: CatalogInfo | null = null;
/** Lo anota `openDatabases` con el índice que ha abierto. */
export function setInstalledCatalog(info: CatalogInfo): void {
  installed = info;
}

async function fetchManifest(): Promise<CatalogManifest | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(catalogUrl('c/manifest.json'), { signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseManifest(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

async function downloadVerified(m: CatalogManifest, onProgress: (p: number) => void, onVerify: () => void): Promise<File | null> {
  const part = new File(dbDir(), `${INDEX_PREFIX}${m.version}.db.part`);
  if (part.exists) part.delete();
  const task = new DownloadTask(catalogUrl(m.files.raw.path), part, {
    // Los bytes escritos son ya los descomprimidos: se comparan con el tamaño final.
    onProgress: ({ bytesWritten }) => onProgress(Math.min(0.99, bytesWritten / m.size)),
  });
  const file = await task.downloadAsync();
  if (!file) return null;
  onVerify();
  // Un respiro para que la pantalla pinte «Comprobando» antes del cálculo (síncrono).
  await new Promise((r) => setTimeout(r, 50));
  const md5 = file.info({ md5: true }).md5;
  if (md5 === m.md5) return file;
  file.delete();
  return null;
}

/** Baja, comprueba e instala el índice del manifiesto; queda anotado como activo. */
async function install(m: CatalogManifest, onProgress: (p: number) => void, onVerify: () => void): Promise<ActiveCatalog> {
  // Un segundo intento si la primera descarga llega dañada (se corta, proxy…).
  const file = (await downloadVerified(m, onProgress, onVerify)) ?? (await downloadVerified(m, onProgress, onVerify));
  if (!file) throw new Error('El catálogo descargado no supera la comprobación (MD5)');
  const name = `${INDEX_PREFIX}${m.version}.db`;
  const dest = new File(dbDir(), name);
  if (dest.exists) dest.delete();
  file.rename(name);
  const info: ActiveCatalog = {
    version: m.version,
    schema: m.schema,
    built_at: m.built_at,
    species: m.species,
    shards: m.shards,
    size: m.size,
    file: name,
    md5: m.md5,
  };
  const active = new File(dbDir(), ACTIVE_FILE);
  if (!active.exists) active.create();
  active.write(JSON.stringify(info));
  return info;
}

/**
 * ¿Falló por falta de red? Solo si el sistema dice que no hay conexión o el
 * error es de los de red (fetch sin red, tiempo agotado, servidor
 * inalcanzable). Cualquier otro error se enseña tal cual: decir «sin
 * conexión» cuando no es eso deja a la persona sin saber qué pasa.
 */
async function isOffline(e: unknown): Promise<boolean> {
  const net = await Network.getNetworkStateAsync().catch(() => null);
  if (net && (net.isConnected === false || net.isInternetReachable === false)) return true;
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /Network request failed|AbortError|timed? ?out|Unable to resolve host|Failed to connect|UnknownHost|ConnectException|SocketTimeout/i.test(msg);
}

/**
 * Primera descarga (o tras un índice dañado): baja el índice vigente. Lanza
 * `CatalogOffline` si no hay red; la pantalla de arranque ofrece reintentar.
 */
export async function installLatestCatalog(onProgress: (p: number, phase: 'downloading' | 'verifying', total: number) => void): Promise<ActiveCatalog> {
  let m: CatalogManifest | null;
  try {
    m = await fetchManifest();
  } catch (e) {
    if (await isOffline(e)) throw new CatalogOffline();
    throw e;
  }
  if (!m) throw new Error('No hay catálogo publicado');
  if (m.schema !== CATALOG_SCHEMA) throw new Error('El catálogo publicado es de otra versión de la app: actualiza Zarpa');
  // Lo que viaja por la red es el índice comprimido: el tamaño del .gz es una buena estimación.
  const total = m.files.gz.size;
  try {
    return await install(
      m,
      (p) => onProgress(p, 'downloading', total),
      () => onProgress(1, 'verifying', total),
    );
  } catch (e) {
    if (await isOffline(e)) throw new CatalogOffline();
    throw e;
  }
}

let running: Promise<void> | null = null;

/**
 * Mira si hay un índice nuevo y, si toca, lo baja. Sin `force` respeta el
 * ritmo de una vez al día y solo baja con wifi; con `force` (botón del perfil,
 * o una ficha que ya no está en el servidor) mira ya y baja con cualquier red.
 */
export function checkCatalogUpdate(opts: { force?: boolean } = {}): Promise<void> {
  running ??= check(opts).finally(() => {
    running = null;
  });
  return running;
}

async function check({ force = false }: { force?: boolean }): Promise<void> {
  const current = installed;
  if (!current) return;
  if (!force) {
    const last = Number((await AsyncStorage.getItem(LAST_CHECK_KEY).catch(() => null)) ?? 0);
    if (Date.now() - last < CHECK_EVERY_MS) return;
  }
  const net = await Network.getNetworkStateAsync().catch(() => null);
  if (net && (net.isConnected === false || net.isInternetReachable === false)) {
    useCatalogUpdate.setState({ phase: 'offline' });
    return;
  }

  useCatalogUpdate.setState({ phase: 'checking', error: null, progress: 0 });
  try {
    const m = await fetchManifest();
    const now = new Date().toISOString();
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now())).catch(() => {});
    useCatalogUpdate.setState({ remote: m, checkedAt: now });

    // ¿Ya está bajado y esperando a que se reabra la app?
    const pending = readActiveCatalog();
    if (m && pending && pending.version === m.version && pending.version !== current.version) {
      useCatalogUpdate.setState({ phase: 'ready' });
      return;
    }
    if (!m || !isNewerCatalog(m, current, CATALOG_SCHEMA)) {
      useCatalogUpdate.setState({ phase: 'uptodate' });
      return;
    }
    const wifi = net?.type === Network.NetworkStateType.WIFI || net?.type === Network.NetworkStateType.ETHERNET;
    if (!force && !wifi) {
      useCatalogUpdate.setState({ phase: 'available' });
      return;
    }

    useCatalogUpdate.setState({ phase: 'downloading', progress: 0 });
    await install(
      m,
      (progress) => useCatalogUpdate.setState({ progress }),
      () => useCatalogUpdate.setState({ phase: 'verifying' }),
    );
    useCatalogUpdate.setState({ phase: 'ready', progress: 1 });
  } catch (e) {
    useCatalogUpdate.setState({
      phase: 'error',
      error: (await isOffline(e)) ? 'Sin conexión estable. Se reintentará.' : `No se pudo actualizar el catálogo: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
