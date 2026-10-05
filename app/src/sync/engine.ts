import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { journal } from '@/db';
import { fb, firebaseEnabled } from '@/lib/firebase';
import { removeVoiceFile, voiceExists, voiceUri } from '@/lib/voiceFiles';
import { useAuth } from '@/store/auth';
import { useJournal } from '@/store/journal';

import {
  clearAccountState,
  ensureSyncTables,
  forget,
  getMeta,
  getNotebookOwner,
  loadStates,
  markFailed,
  markPhotoOk,
  markStickerOk,
  markSynced,
  markVoicePath,
  setMeta,
  setNotebookOwner,
  sightingColumns,
} from './db';
import { wipeLocalNotebook } from './notebook';
import {
  fromRemote,
  planSync,
  remoteIsNewer,
  rowHash,
  STICKER_EXTS,
  stickerExtOf,
  storagePath,
  toRemote,
  voiceExtOf,
  voiceKey,
  voiceUploaded,
  type ItemState,
  type LocalRow,
} from './schema';
import { useSync } from './store';

/*
 * Sincronización del cuaderno con Firestore y Storage.
 *
 * Reglas del juego:
 *   - El cuaderno local (SQLite) es la fuente de verdad y manda: la app funciona
 *     igual sin red y sin cuenta. La nube es una copia.
 *   - Cada pasada hace, en este orden: bajar lo nuevo de la nube → subir lo
 *     nuevo o cambiado → borrar en la nube lo que el usuario borró aquí.
 *   - Nada se duplica: el id del avistamiento (UUID) es también el id del
 *     documento y el nombre de sus ficheros (foto, pegatina y nota de voz), así
 *     que repetir una pasada es inocuo.
 *   - Si algo falla se anota en `sync_item` (cola de reintento) y se vuelve a
 *     intentar con espera creciente, al volver la red o al abrir la app.
 *   - Si el mismo avistamiento cambió aquí y en otro móvil, gana la edición más
 *     reciente (`updated_at`).
 *   - El borrado en otro móvil NO se propaga a este (preferimos conservar
 *     datos a perderlos por un fallo de sincronización).
 *   - El cuaderno del móvil tiene dueño. Si entra otra cuenta, no se mezcla en
 *     silencio: la sincronización se para (`blocked`) hasta que la persona
 *     decida con `resolveAccountSwitch`.
 */

const PHOTO_DIR = () => new Directory(Paths.document, 'avistamientos');
const VOICE_DIR = 'notas-voz';

class NetworkDown extends Error {}

function isNetworkError(e: unknown): boolean {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  return (
    e instanceof NetworkDown ||
    code === 'unavailable' ||
    code === 'storage/retry-limit-exceeded' ||
    code === 'storage/unknown' ||
    code === 'deadline-exceeded' ||
    /network|fetch|offline|timeout/i.test(e instanceof Error ? e.message : '')
  );
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const isNotFound = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'storage/object-not-found';

// ---- Ficheros ----------------------------------------------------------------

async function localRows(): Promise<(LocalRow & { id: string })[]> {
  return journal().getAllAsync<LocalRow & { id: string }>('SELECT * FROM sighting');
}

function fileExists(uri: unknown): boolean {
  if (typeof uri !== 'string' || !uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

async function upload(path: string, uri: string, contentType: string): Promise<void> {
  const blob = await (await fetch(uri)).blob();
  await uploadBytes(ref(fb().storage, path), blob, { contentType });
}

/** Borra un fichero de Storage; que ya no esté no es un fallo. */
async function removeRemote(path: string): Promise<void> {
  await deleteObject(ref(fb().storage, path)).catch((e: unknown) => {
    if (!isNotFound(e)) throw e;
  });
}

async function download(path: string, dest: File): Promise<string> {
  if (dest.exists) dest.delete();
  const url = await getDownloadURL(ref(fb().storage, path));
  const file = await File.downloadFileAsync(url, dest);
  return file.uri;
}

function photoDir(): Directory {
  const dir = PHOTO_DIR();
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Baja la nota de voz de la nube y devuelve su ruta relativa (`notas-voz/…`). */
async function downloadVoice(uid: string, id: string, ext: string): Promise<string> {
  const dir = new Directory(Paths.document, VOICE_DIR);
  dir.create({ idempotent: true, intermediates: true });
  const name = `${id}-${Date.now()}.${ext}`;
  await download(storagePath.voice(uid, id, ext), new File(dir, name));
  return `${VOICE_DIR}/${name}`;
}

const AUDIO_TYPE: Record<string, string> = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', caf: 'audio/x-caf', '3gp': 'audio/3gpp' };

// ---- Subida y borrado ----------------------------------------------------------

/** Sube una fila: primero los ficheros que falten, después el documento. */
async function pushOne(uid: string, row: LocalRow & { id: string }, state: ItemState | undefined): Promise<void> {
  // Foto.
  let photo: 1 | 2 = state?.photo_ok === 1 ? 1 : 2;
  if (state?.photo_ok !== 1) {
    if (fileExists(row.photo)) {
      await upload(storagePath.photo(uid, row.id), row.photo as string, 'image/jpeg');
      await markPhotoOk(uid, row.id);
      photo = 1;
    }
  }

  // Pegatina: solo si es un fichero distinto de la foto.
  let sticker: 1 | 2 = state?.sticker_ok === 1 ? 1 : 2;
  if (state?.sticker_ok !== 1) {
    const uri = row.sticker;
    if (typeof uri === 'string' && uri && uri !== row.photo && fileExists(uri)) {
      const ext = stickerExtOf(uri);
      await upload(storagePath.sticker(uid, row.id, ext), uri, ext === 'png' ? 'image/png' : 'image/jpeg');
      await markStickerOk(uid, row.id, 1);
      sticker = 1;
    }
  }

  // Nota de voz: se sube si cambió, se borra de la nube si se quitó.
  const rel = typeof row.voice_note === 'string' && row.voice_note ? row.voice_note : null;
  let voice = state?.voice_path ?? null;
  if (rel !== voiceKey(voice)) {
    const old = voiceUploaded(voice) ? voiceExtOf(voice) : null;
    if (rel && voiceExists(rel)) {
      const ext = voiceExtOf(rel);
      await upload(storagePath.voice(uid, row.id, ext), voiceUri(rel), AUDIO_TYPE[ext] ?? 'audio/mp4');
      if (old && old !== ext) await removeRemote(storagePath.voice(uid, row.id, old));
      voice = rel;
    } else {
      if (old) await removeRemote(storagePath.voice(uid, row.id, old));
      // Sin fichero en el móvil: se anota para no reintentarlo en cada pasada.
      voice = rel ? `!${rel}` : null;
    }
    await markVoicePath(uid, row.id, voice);
  }

  const files = { photo: photo === 1, sticker: sticker === 1, voice: voiceUploaded(voice) };
  await setDoc(doc(fb().db, 'users', uid, 'sightings', row.id), { ...toRemote(row, files), synced_at: serverTimestamp() });
  await markSynced(uid, row.id, rowHash(row), { photo, sticker, voice });
}

async function removeOne(uid: string, id: string, state: ItemState | undefined): Promise<void> {
  await deleteDoc(doc(fb().db, 'users', uid, 'sightings', id));
  await removeRemote(storagePath.photo(uid, id));
  for (const ext of STICKER_EXTS) await removeRemote(storagePath.sticker(uid, id, ext));
  const voiceExts = voiceUploaded(state?.voice_path) ? [voiceExtOf(state?.voice_path)] : ['m4a'];
  for (const ext of voiceExts) await removeRemote(storagePath.voice(uid, id, ext));
  await forget(uid, id);
}

// ---- Bajada ------------------------------------------------------------------

/**
 * Trae la nota de voz de la nube a una fila que ya existe aquí, si cambió.
 * Devuelve la ruta relativa resultante (o null si ya no hay nota).
 */
async function refreshVoice(uid: string, id: string, data: Record<string, unknown>, local: LocalRow, state: ItemState | undefined): Promise<string | null> {
  const current = typeof local.voice_note === 'string' && local.voice_note ? local.voice_note : null;
  if (data.has_voice !== true) {
    if (current) removeVoiceFile(current);
    return null;
  }
  // Misma duración y ya teníamos una nota subida desde aquí: es la misma grabación.
  if (current && voiceExists(current) && data.voice_ms === local.voice_ms && voiceUploaded(state?.voice_path)) return current;
  const rel = await downloadVoice(uid, id, voiceExtOf(`x.${String(data.voice_ext ?? 'm4a')}`));
  if (current && current !== rel) removeVoiceFile(current);
  return rel;
}

/** Baja de la nube lo escrito desde la última pasada (cualquier móvil de esta cuenta). */
async function pull(uid: string, localById: Map<string, LocalRow & { id: string }>, states: Map<string, ItemState>): Promise<number> {
  const since = await getMeta(uid, 'pull_since');
  const col = collection(fb().db, 'users', uid, 'sightings');
  const q = since ? query(col, where('synced_at', '>', Timestamp.fromMillis(Number(since))), orderBy('synced_at')) : query(col, orderBy('synced_at'));
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const columns = await sightingColumns();
  let changed = 0;
  let maxMillis = since ? Number(since) : 0;

  for (const d of snap.docs) {
    const data = d.data();
    const ts = data.synced_at instanceof Timestamp ? data.synced_at.toMillis() : 0;
    maxMillis = Math.max(maxMillis, ts);
    const id = d.id;
    const local = localById.get(id);
    const state = states.get(id);
    const remoteFiles = {
      photo: (data.has_photo === true ? 1 : 2) as 1 | 2,
      sticker: (data.has_sticker === true ? 1 : 2) as 1 | 2,
    };

    try {
      if (local) {
        const localHash = rowHash(local);
        if (!state) {
          // Mismo avistamiento en este móvil y en la nube, sin historial: queda enlazado.
          const voice = typeof local.voice_note === 'string' && local.voice_note && data.has_voice === true ? local.voice_note : null;
          await markSynced(uid, id, localHash, { ...remoteFiles, voice });
          continue;
        }
        // Gana la nube si aquí no se ha tocado desde la última subida, o si se
        // tocó en los dos sitios y la edición de la nube es más reciente.
        const untouched = state.status === 'synced' && state.hash === localHash;
        if (!untouched && !remoteIsNewer(local.updated_at, data.updated_at)) continue;
        const incoming: Record<string, unknown> = fromRemote(data, columns);
        if (columns.includes('voice_note')) incoming.voice_note = await refreshVoice(uid, id, data, local, state);
        const merged = { ...local, ...incoming };
        const remoteHash = rowHash(merged);
        if (remoteHash !== localHash || incoming.voice_note !== local.voice_note) {
          const keys = Object.keys(incoming);
          await journal().runAsync(`UPDATE sighting SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [
            ...keys.map((k) => incoming[k] as string | number | null),
            id,
          ]);
          changed++;
        }
        const voice = typeof incoming.voice_note === 'string' ? incoming.voice_note : null;
        await markSynced(uid, id, remoteHash, { photo: state.photo_ok === 1 ? 1 : remoteFiles.photo, sticker: state.sticker_ok === 1 ? 1 : remoteFiles.sticker, voice });
        continue;
      }
      if (state?.status === 'synced') continue; // lo borré aquí: lo retirará la fase de borrado

      // Es nuevo para este móvil: ficheros primero, fila después.
      let photoUri = '';
      if (data.has_photo === true) photoUri = await download(storagePath.photo(uid, id), new File(photoDir(), `${id}.jpg`));
      let stickerUri: string | null = null;
      if (data.has_sticker === true) {
        const ext = data.sticker_ext === 'png' ? 'png' : 'jpg';
        stickerUri = await download(storagePath.sticker(uid, id, ext), new File(photoDir(), `${id}-pegatina.${ext}`));
      }
      let voiceRel: string | null = null;
      if (data.has_voice === true) voiceRel = await downloadVoice(uid, id, voiceExtOf(`x.${String(data.voice_ext ?? 'm4a')}`));

      const values: Record<string, string | number | boolean | null> = fromRemote(data, columns);
      values.photo = photoUri;
      if (columns.includes('sticker')) values.sticker = stickerUri ?? (photoUri || null);
      if (columns.includes('voice_note')) values.voice_note = voiceRel;
      const cols = ['id', ...Object.keys(values)];
      await journal().runAsync(
        `INSERT OR IGNORE INTO sighting (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        [id, ...Object.keys(values).map((k) => values[k])],
      );
      const inserted = await journal().getFirstAsync<LocalRow>('SELECT * FROM sighting WHERE id = ?', [id]);
      if (inserted) await markSynced(uid, id, rowHash(inserted), { ...remoteFiles, voice: voiceRel });
      changed++;
    } catch (e) {
      if (isNetworkError(e)) throw e;
      await markFailed(uid, id, `bajada: ${errText(e)}`);
      // No avanzar la marca por encima de un documento que falló, para reintentarlo.
      maxMillis = Math.min(maxMillis, Math.max(0, ts - 1));
    }
  }
  if (maxMillis > 0) await setMeta(uid, 'pull_since', String(maxMillis));
  return changed;
}

// ---- Dueño del cuaderno --------------------------------------------------------

/** Avistamientos locales que no están (o no al día) en la nube de `uid`. */
export async function countUnsynced(uid: string): Promise<{ count: number; unsynced: number }> {
  await ensureSyncTables();
  const rows = await localRows();
  const states = new Map((await loadStates(uid)).map((s) => [s.id, s]));
  let unsynced = 0;
  for (const r of rows) {
    const st = states.get(r.id);
    if (!st || st.status !== 'synced' || st.hash !== rowHash(r)) unsynced++;
  }
  return { count: rows.length, unsynced };
}

/**
 * ¿Puede sincronizar esta cuenta con el cuaderno del móvil? Un cuaderno sin
 * dueño pasa a ser de quien entra (es el primer inicio de sesión: su álbum sin
 * cuenta se guarda en su nube). Si es de otra cuenta, se para y se pregunta.
 */
async function claimNotebook(uid: string): Promise<boolean> {
  const owner = await getNotebookOwner();
  if (owner === uid) return true;
  if (owner == null) {
    await setNotebookOwner(uid);
    return true;
  }
  const { count, unsynced } = await countUnsynced(owner);
  if (count === 0) {
    // El cuaderno está vacío: no hay nada que decidir.
    await clearAccountState(owner);
    await setNotebookOwner(uid);
    return true;
  }
  useSync.setState({ phase: 'blocked', error: null, pending: 0, conflict: { uid, owner, count, unsynced } });
  return false;
}

export type AccountSwitchChoice = 'merge' | 'replace' | 'cancel';

/**
 * Decide qué hacer con el cuaderno de otra cuenta que hay en este móvil.
 *   merge    sus avistamientos pasan a la cuenta que acaba de entrar y se suben.
 *   replace  se vacía el cuaderno del móvil y se baja el de la cuenta nueva
 *            (lo que la otra cuenta no hubiera subido se pierde: la pantalla avisa).
 *   cancel   se cierra la sesión nueva y el cuaderno queda como estaba.
 */
export async function resolveAccountSwitch(choice: AccountSwitchChoice): Promise<void> {
  const conflict = useSync.getState().conflict;
  if (!conflict) return;
  const current = useAuth.getState().user?.uid;
  // El conflicto sigue puesto mientras se resuelve: así ninguna pasada se cuela
  // y sube el cuaderno de una cuenta a la otra a medio camino.
  if (choice === 'cancel' || current !== conflict.uid) {
    if (current === conflict.uid) await useAuth.getState().signOut();
    useSync.setState({ conflict: null, phase: 'off', pending: 0, error: null });
    return;
  }
  if (choice === 'merge') {
    await clearAccountState(conflict.owner);
  } else {
    await wipeLocalNotebook(conflict.owner);
  }
  await setNotebookOwner(conflict.uid);
  useSync.setState({ conflict: null });
  failures = 0;
  await syncNow();
}

// ---- Orquestación ----------------------------------------------------------

let running: Promise<void> | null = null;
let rerun = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let started = false;

/** Una pasada completa. Si ya hay una en marcha, pide otra al terminar. */
export function syncNow(opts: { retryExhausted?: boolean } = {}): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = pass(opts).finally(() => {
    running = null;
    if (rerun) {
      rerun = false;
      void syncNow();
    }
  });
  return running;
}

/** Espera a que acabe la pasada en marcha, si la hay. */
export async function syncIdle(): Promise<void> {
  while (running) await running.catch(() => {});
}

async function pass(opts: { retryExhausted?: boolean }): Promise<void> {
  const user = useAuth.getState().user;
  if (!firebaseEnabled || !user) {
    useSync.setState({ phase: 'off', pending: 0, error: null, conflict: null });
    return;
  }
  const uid = user.uid;
  if (useSync.getState().conflict?.uid === uid) return; // esperando la decisión
  const net = await Network.getNetworkStateAsync().catch(() => null);
  if (net && (net.isConnected === false || net.isInternetReachable === false)) {
    useSync.setState({ phase: 'offline' });
    return;
  }

  try {
    await ensureSyncTables();
    if (!(await claimNotebook(uid))) return;
    useSync.setState({ phase: 'syncing', error: null });
    const last = await getMeta(uid, 'last_sync');
    if (last && useSync.getState().lastSyncAt == null) useSync.setState({ lastSyncAt: last });

    let rows = await localRows();
    let states = await loadStates(uid);
    const pulled = await pull(uid, new Map(rows.map((r) => [r.id, r])), new Map(states.map((s) => [s.id, s])));

    rows = await localRows();
    states = await loadStates(uid);
    const local = rows.map((r) => ({
      id: r.id,
      hash: rowHash(r),
      voice: typeof r.voice_note === 'string' && r.voice_note ? r.voice_note : null,
    }));
    const plan = planSync(local, states, opts);
    const stateById = new Map(states.map((s) => [s.id, s]));
    const rowById = new Map(rows.map((r) => [r.id, r]));
    useSync.setState({ pending: plan.push.length + plan.remove.length });

    let failed = 0;
    for (const id of plan.push) {
      const row = rowById.get(id);
      if (!row) continue;
      try {
        await pushOne(uid, row, stateById.get(id));
      } catch (e) {
        if (isNetworkError(e)) throw e;
        failed++;
        await markFailed(uid, id, errText(e));
      }
      useSync.setState((s) => ({ pending: Math.max(0, s.pending - 1) }));
    }
    for (const id of plan.remove) {
      try {
        await removeOne(uid, id, stateById.get(id));
      } catch (e) {
        if (isNetworkError(e)) throw e;
        failed++;
        await markFailed(uid, id, errText(e));
      }
      useSync.setState((s) => ({ pending: Math.max(0, s.pending - 1) }));
    }

    const now = new Date().toISOString();
    await setMeta(uid, 'last_sync', now);
    failures = failed > 0 ? failures + 1 : 0;
    useSync.setState({
      phase: failed > 0 ? 'error' : 'idle',
      lastSyncAt: now,
      pending: failed,
      error: failed > 0 ? 'Algunos avistamientos no se han podido copiar. Se reintentará.' : null,
    });
    if (failed > 0) scheduleRetry();
    else clearRetry();

    // Si bajaron avistamientos de la nube, el cuaderno en memoria se refresca.
    if (pulled > 0) await useJournal.getState().load();
  } catch (e) {
    failures++;
    if (isNetworkError(e)) {
      useSync.setState({ phase: 'offline', error: null });
    } else {
      useSync.setState({ phase: 'error', error: 'No se pudo sincronizar. Se reintentará en un momento.' });
    }
    scheduleRetry();
  }
}

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** Espera creciente: 15 s, 30 s, 1 min… hasta 10 min. */
function scheduleRetry(): void {
  clearRetry();
  const wait = Math.min(15_000 * 2 ** Math.max(0, failures - 1), 600_000);
  retryTimer = setTimeout(() => void syncNow(), wait);
}

/**
 * Engancha la sincronización a lo que la dispara (una sola vez, desde el
 * layout raíz): iniciar sesión, volver a la app, recuperar la red y cualquier
 * cambio del cuaderno (con un respiro para agrupar ráfagas).
 */
export function startSync(): void {
  if (started || !firebaseEnabled) return;
  started = true;

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const soon = (ms = 2500) => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), ms);
  };

  let lastUid: string | null = null;
  useAuth.subscribe((s) => {
    const uid = s.user?.uid ?? null;
    if (uid === lastUid) return;
    lastUid = uid;
    failures = 0;
    clearRetry();
    if (uid) void syncNow();
    else useSync.setState({ phase: 'off', pending: 0, lastSyncAt: null, error: null, conflict: null });
  });

  let lastCaught = useJournal.getState().caught;
  let lastAt = useJournal.getState().lastSightingAt;
  let lastEdit = useJournal.getState().editedAt;
  useJournal.subscribe((s) => {
    if (s.caught === lastCaught && s.lastSightingAt === lastAt && s.editedAt === lastEdit) return;
    lastCaught = s.caught;
    lastAt = s.lastSightingAt;
    lastEdit = s.editedAt;
    if (useAuth.getState().user) soon();
  });

  AppState.addEventListener('change', (st) => {
    if (st === 'active' && useAuth.getState().user) soon(500);
  });
  Network.addNetworkStateListener((ev) => {
    if (ev.isConnected && ev.isInternetReachable !== false && useAuth.getState().user) soon(1000);
  });
}

/** Para quien edite un avistamiento sin pasar por el almacén (notas, clima...): pide una pasada pronto. */
export function requestSync(): void {
  if (useAuth.getState().user) void syncNow();
}
