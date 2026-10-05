import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';

import { journal } from '@/db';
import { fb } from '@/lib/firebase';
import { ensureSyncTables, setMeta } from '@/sync/db';
import { storagePath } from '@/sync/schema';

import { buildAlbum, diffAlbum, entryHash, type AlbumEntry, type AlbumSighting } from './albumLogic';

/*
 * Publicación del álbum compartido (`users/{uid}/album/{especie}`) y lectura
 * del de un amigo. Lo publicado se recuerda en `sync_meta` (`album:<especie>`
 * → hash) para escribir solo lo que cambió.
 */

const KEY = 'album:';

async function publishedHashes(uid: string): Promise<Map<number, string>> {
  await ensureSyncTables();
  const rows = await journal().getAllAsync<{ key: string; value: string | null }>(
    "SELECT key, value FROM sync_meta WHERE uid = ? AND key LIKE 'album:%'",
    [uid],
  );
  return new Map(rows.map((r) => [Number(r.key.slice(KEY.length)), r.value ?? '']));
}

/** Olvida lo publicado (al dejar de compartir: el servidor ya borra el álbum). */
export async function forgetPublishedAlbum(uid: string): Promise<void> {
  await ensureSyncTables();
  await journal().runAsync("DELETE FROM sync_meta WHERE uid = ? AND key LIKE 'album:%'", [uid]);
}

/** Escribe en la nube las fichas nuevas o cambiadas y retira las de especies que ya no están. */
export async function publishAlbum(uid: string): Promise<number> {
  const rows = await journal().getAllAsync<AlbumSighting>('SELECT id, species_id, created_at, sticker, photo FROM sighting WHERE species_id IS NOT NULL');
  const inCloud = await journal().getAllAsync<{ id: string }>('SELECT id FROM sync_item WHERE uid = ? AND sticker_ok = 1', [uid]);
  const entries = buildAlbum(rows, new Set(inCloud.map((r) => r.id)));
  const { upsert, remove } = diffAlbum(entries, await publishedHashes(uid));
  const now = new Date().toISOString();
  for (const e of upsert) {
    await setDoc(doc(fb().db, 'users', uid, 'album', String(e.species_id)), { ...e, updated_at: now });
    await setMeta(uid, `${KEY}${e.species_id}`, entryHash(e));
  }
  for (const id of remove) {
    await deleteDoc(doc(fb().db, 'users', uid, 'album', String(id)));
    await journal().runAsync('DELETE FROM sync_meta WHERE uid = ? AND key = ?', [uid, `${KEY}${id}`]);
  }
  return upsert.length + remove.length;
}

export type FriendAlbumEntry = AlbumEntry & { updated_at?: string };

/** Álbum de un amigo (las reglas solo lo dejan leer si comparte y sois amigos). */
export async function loadFriendAlbum(friendUid: string): Promise<FriendAlbumEntry[]> {
  const snap = await getDocs(collection(fb().db, 'users', friendUid, 'album'));
  return snap.docs.map((d) => d.data() as FriendAlbumEntry).sort((a, b) => b.last.localeCompare(a.last) || b.count - a.count);
}

const urlCache = new Map<string, Promise<string | null>>();

/** URL de la pegatina de un amigo (en memoria mientras la app esté abierta). */
export function friendStickerUrl(friendUid: string, e: Pick<AlbumEntry, 'sticker' | 'sticker_ext'>): Promise<string | null> {
  if (!e.sticker || !e.sticker_ext) return Promise.resolve(null);
  const path = storagePath.sticker(friendUid, e.sticker, e.sticker_ext);
  let p = urlCache.get(path);
  if (!p) {
    p = getDownloadURL(ref(fb().storage, path)).catch(() => null);
    urlCache.set(path, p);
  }
  return p;
}
