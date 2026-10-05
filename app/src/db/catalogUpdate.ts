import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, DownloadTask, File } from 'expo-file-system';
import * as Network from 'expo-network';
import * as SQLite from 'expo-sqlite';
import { create } from 'zustand';

import { CATALOG_SCHEMA } from './catalogAsset';
import { isNewerCatalog, parseManifest, storageUrl, type CatalogInfo, type CatalogManifest } from './catalogCloud';

/*
 * Actualización del catálogo desde Cloud Storage («Storage + caché local»).
 *
 * La app trae un catálogo dentro y funciona sin red desde el primer día. Una
 * vez al día (o al pulsar «Buscar actualización» en el perfil) se mira el
 * manifiesto público `catalog/manifest.json`. Si hay un catálogo más nuevo de
 * este mismo esquema:
 *   1. se baja a `catalogo-<versión>.db.part` (con wifi; con datos móviles solo
 *      si la persona lo pide), primero comprimido y, si el MD5 no cuadra, sin
 *      comprimir;
 *   2. se comprueba el MD5 y se renombra a `catalogo-<versión>.db`;
 *   3. se anota en `catalogo-activo.json` y se usa al volver a abrir la app
 *      (cambiarlo en caliente dejaría consultas a medias con la base vieja).
 */

const ACTIVE_FILE = 'catalogo-activo.json';
const LAST_CHECK_KEY = 'zarpa-catalog-last-check';
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '';

export const catalogUpdatesEnabled = BUCKET.length > 0;

export type DownloadedCatalog = CatalogInfo & { file: string; md5: string };

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

function dbDir(): Directory {
  return new Directory(SQLite.defaultDatabaseDirectory);
}

/** El catálogo bajado de la nube que está anotado como activo, si sigue en disco. */
export function readDownloadedCatalog(): DownloadedCatalog | null {
  try {
    const f = new File(dbDir(), ACTIVE_FILE);
    if (!f.exists) return null;
    const info = JSON.parse(f.textSync()) as DownloadedCatalog;
    if (!info?.file || !new File(dbDir(), info.file).exists) return null;
    return { ...info, source: 'nube' };
  } catch {
    return null;
  }
}

/** Olvida el catálogo bajado (p. ej. si no abre): la app vuelve al suyo. */
export function forgetDownloadedCatalog(): void {
  try {
    const f = new File(dbDir(), ACTIVE_FILE);
    if (f.exists) f.delete();
  } catch {
    // Sin el fichero, la próxima vez se abre el de la app igualmente.
  }
}

let installed: CatalogInfo | null = null;
/** Lo anota `openDatabases` con el catálogo que ha abierto. */
export function setInstalledCatalog(info: CatalogInfo): void {
  installed = info;
}
export function installedCatalog(): CatalogInfo | null {
  return installed;
}

async function fetchManifest(): Promise<CatalogManifest | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(storageUrl(BUCKET, 'catalog/manifest.json'), { signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseManifest(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

async function downloadVerified(m: CatalogManifest, kind: 'gz' | 'raw'): Promise<File | null> {
  const part = new File(dbDir(), `catalogo-${m.version}.db.part`);
  if (part.exists) part.delete();
  const task = new DownloadTask(storageUrl(BUCKET, m.files[kind].path), part, {
    // Los bytes escritos son ya los descomprimidos: se comparan con el tamaño final.
    onProgress: ({ bytesWritten }) => useCatalogUpdate.setState({ progress: Math.min(0.99, bytesWritten / m.size) }),
  });
  const file = await task.downloadAsync();
  if (!file) return null;
  useCatalogUpdate.setState({ phase: 'verifying' });
  // Un respiro para que la pantalla pinte «Comprobando» antes del cálculo (síncrono, ~1 s).
  await new Promise((r) => setTimeout(r, 50));
  const md5 = file.info({ md5: true }).md5;
  if (md5 === m.md5) return file;
  file.delete();
  return null;
}

let running: Promise<void> | null = null;

/**
 * Mira si hay un catálogo nuevo y, si toca, lo baja. Sin `force` respeta el
 * ritmo de una vez al día y solo baja con wifi; con `force` (botón del perfil)
 * mira ya y baja con cualquier conexión.
 */
export function checkCatalogUpdate(opts: { force?: boolean } = {}): Promise<void> {
  if (!catalogUpdatesEnabled) return Promise.resolve();
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
    const pending = readDownloadedCatalog();
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
    const file = (await downloadVerified(m, 'gz')) ?? (await downloadVerified(m, 'raw'));
    if (!file) throw new Error('El catálogo descargado no supera la comprobación');
    const name = `catalogo-${m.version}.db`;
    const dest = new File(dbDir(), name);
    if (dest.exists) dest.delete();
    file.rename(name);
    const info: DownloadedCatalog = {
      version: m.version,
      schema: m.schema,
      built_at: m.built_at,
      species: m.species,
      source: 'nube',
      file: name,
      md5: m.md5,
    };
    new File(dbDir(), ACTIVE_FILE).write(JSON.stringify(info));
    useCatalogUpdate.setState({ phase: 'ready', progress: 1 });
  } catch (e) {
    useCatalogUpdate.setState({
      phase: 'error',
      error: e instanceof Error && /network|fetch|abort/i.test(e.message) ? 'Sin conexión estable. Se reintentará.' : 'No se pudo actualizar el catálogo.',
    });
  }
}
