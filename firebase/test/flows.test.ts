import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createProfile,
  ensureFriendCode,
  normalizeCode,
  publishPublicProfile,
  refreshFriendEdges,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  SocialError,
  wipeAccountData,
  withdrawAlbum,
  type Me,
} from '../../app/src/social/flows';

/*
 * Los flujos de la app (app/src/social/flows.ts) contra el emulador de
 * Firestore con las reglas de verdad: en el plan gratuito no hay servidor, así
 * que cada paso tiene que caber en lo que las reglas permiten.
 */

const root = resolve(__dirname, '..', '..');
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-zarpa',
    firestore: { rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

/** Azar determinista: cada llamada da la siguiente letra del alfabeto. */
function counter(start = 0) {
  let i = start;
  return (max: number) => i++ % max;
}

const db = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const me = (uid: string, alias: string): Me => ({ uid, alias, photoURL: null });

async function signUp(uid: string, alias: string, seed: number): Promise<string> {
  await createProfile(db(uid), { uid, displayName: alias, photoURL: 'https://lh3.googleusercontent.com/a/' + uid });
  return ensureFriendCode(db(uid), uid, counter(seed));
}

let codes: Record<string, string>;

beforeEach(async () => {
  await env.clearFirestore();
  codes = {
    ana: await signUp('ana', 'Ana', 0),
    bea: await signUp('bea', 'Bea', 8),
    cai: await signUp('cai', 'Cai', 16),
  };
});

const exists = async (path: string) => {
  let found = false;
  await env.withSecurityRulesDisabled(async (ctx) => {
    found = (await getDoc(doc(ctx.firestore(), path))).exists();
  });
  return found;
};

describe('alta', () => {
  it('crea el perfil de partida y un código de amigo único y estable', async () => {
    const snap = await getDoc(doc(db('ana'), 'users/ana'));
    expect(snap.get('alias')).toBe('Ana');
    expect(snap.get('counters')).toEqual({ sightings: 0, species: 0 });
    expect(snap.get('friendCode')).toBe(codes.ana);
    expect(new Set(Object.values(codes)).size).toBe(3);
    // Pedirlo otra vez devuelve el mismo.
    expect(await ensureFriendCode(db('ana'), 'ana', counter(99))).toBe(codes.ana);
  });

  it('si el código ya es de otra persona, prueba con otro', async () => {
    // Con el mismo azar que Ana, el primer código choca con el suyo.
    await createProfile(db('dan'), { uid: 'dan', displayName: 'Dan', photoURL: null });
    const code = await ensureFriendCode(db('dan'), 'dan', counter(0));
    expect(code).not.toBe(codes.ana);
    expect((await getDoc(doc(db('dan'), 'friendCodes', code))).get('uid')).toBe('dan');
  });

  it('normaliza lo que se teclea', () => {
    expect(normalizeCode('abcd efgh')).toBe('ABCDEFGH');
    expect(normalizeCode('ABCD-EFG0')).toBeNull();
    expect(normalizeCode('corto')).toBeNull();
  });
});

describe('amigos', () => {
  it('pedir y aceptar: quedan amigos en las dos listas y la solicitud desaparece', async () => {
    expect(await sendFriendRequest(db('bea'), me('bea', 'Bea'), codes.ana.toLowerCase())).toBe('sent');
    expect(await exists('users/ana/friendRequests/bea')).toBe(true);
    expect(await respondFriendRequest(db('ana'), me('ana', 'Ana'), 'bea', true)).toBe('friends');
    expect((await getDoc(doc(db('ana'), 'users/ana/friends/bea'))).get('alias')).toBe('Bea');
    expect((await getDoc(doc(db('bea'), 'users/bea/friends/ana'))).get('alias')).toBe('Ana');
    expect(await exists('users/ana/friendRequests/bea')).toBe(false);
    // Volver a pedir con el código: ya sois amigos.
    expect(await sendFriendRequest(db('bea'), me('bea', 'Bea'), codes.ana)).toBe('friends');
  });

  it('si los dos se lo piden, la segunda petición acepta la primera', async () => {
    await sendFriendRequest(db('cai'), me('cai', 'Cai'), codes.ana);
    expect(await sendFriendRequest(db('ana'), me('ana', 'Ana'), codes.cai)).toBe('friends');
    expect(await exists('users/ana/friends/cai')).toBe(true);
    expect(await exists('users/cai/friends/ana')).toBe(true);
    expect(await exists('users/ana/friendRequests/cai')).toBe(false);
  });

  it('rechazar borra la solicitud sin crear amistad', async () => {
    await sendFriendRequest(db('cai'), me('cai', 'Cai'), codes.ana);
    expect(await respondFriendRequest(db('ana'), me('ana', 'Ana'), 'cai', false)).toBe('declined');
    expect(await exists('users/ana/friendRequests/cai')).toBe(false);
    expect(await exists('users/ana/friends/cai')).toBe(false);
  });

  it('errores con mensaje para la persona', async () => {
    await expect(sendFriendRequest(db('bea'), me('bea', 'Bea'), 'XYZ')).rejects.toThrow(SocialError);
    await expect(sendFriendRequest(db('bea'), me('bea', 'Bea'), 'ZZZZZZZZ')).rejects.toThrow('No hay nadie con ese código.');
    await expect(sendFriendRequest(db('bea'), me('bea', 'Bea'), codes.bea)).rejects.toThrow('Ese es tu propio código.');
    await expect(respondFriendRequest(db('ana'), me('ana', 'Ana'), 'nadie', true)).rejects.toThrow('Esa solicitud ya no existe.');
  });

  it('quitar un amigo borra las dos fichas', async () => {
    await sendFriendRequest(db('bea'), me('bea', 'Bea'), codes.ana);
    await respondFriendRequest(db('ana'), me('ana', 'Ana'), 'bea', true);
    await removeFriend(db('bea'), 'bea', 'ana');
    expect(await exists('users/ana/friends/bea')).toBe(false);
    expect(await exists('users/bea/friends/ana')).toBe(false);
  });

  it('el alias nuevo llega a la lista de los amigos (y no falla por quien ya no lo es)', async () => {
    await sendFriendRequest(db('bea'), me('bea', 'Bea'), codes.ana);
    await respondFriendRequest(db('ana'), me('ana', 'Ana'), 'bea', true);
    await refreshFriendEdges(db('bea'), 'bea', ['ana', 'cai'], 'Bea R.', null);
    expect((await getDoc(doc(db('ana'), 'users/ana/friends/bea'))).get('alias')).toBe('Bea R.');
  });

  it('el perfil público lo escribe su dueño y lo lee cualquiera con cuenta', async () => {
    await publishPublicProfile(db('ana'), 'ana', { alias: 'Ana', photoURL: null, shareAlbum: true, sightings: 4, species: 3 });
    expect((await getDoc(doc(db('cai'), 'publicProfiles/ana'))).get('species')).toBe(3);
  });
});

describe('álbum y borrado de cuenta', () => {
  const album = (id: number) => ({ species_id: id, count: 1, first: '2026-10', last: '2026-10', sticker: null, sticker_ext: null, updated_at: '2026-10-05T10:00:00Z' });

  it('dejar de compartir retira el álbum de la nube', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ana/album/1'), album(1));
      await setDoc(doc(ctx.firestore(), 'users/ana/album/2'), album(2));
    });
    expect(await withdrawAlbum(db('ana'), 'ana')).toBe(2);
    expect((await getDocs(collection(db('ana'), 'users/ana/album'))).size).toBe(0);
  });

  it('borrar la cuenta no deja rastro: ni en lo suyo ni en las listas de los demás', async () => {
    // Ana es amiga de Bea, pidió amistad a Cai, tiene avistamientos, álbum y perfil público.
    await sendFriendRequest(db('bea'), me('bea', 'Bea'), codes.ana);
    await respondFriendRequest(db('ana'), me('ana', 'Ana'), 'bea', true);
    await sendFriendRequest(db('ana'), me('ana', 'Ana'), codes.cai);
    await publishPublicProfile(db('ana'), 'ana', { alias: 'Ana', photoURL: null, shareAlbum: false, sightings: 2, species: 1 });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const f = ctx.firestore();
      await setDoc(doc(f, 'users/ana/sightings/s1'), { has_photo: true, has_sticker: true, sticker_ext: 'png', has_voice: false });
      await setDoc(doc(f, 'users/ana/sightings/s2'), { has_photo: false, has_voice: true, voice_ext: 'm4a' });
      await setDoc(doc(f, 'users/ana/album/1'), album(1));
      await setDoc(doc(f, 'users/ana/private/settings'), { kids: false });
    });

    const files = await wipeAccountData(db('ana'), 'ana');
    expect(files.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 's1', photo: true, sticker: 'png', voice: null },
      { id: 's2', photo: false, sticker: null, voice: 'm4a' },
    ]);
    for (const path of [
      'users/ana',
      'users/ana/friends/bea',
      'users/bea/friends/ana',
      'users/cai/friendRequests/ana',
      'users/ana/sightings/s1',
      'users/ana/album/1',
      'users/ana/private/settings',
      `friendCodes/${codes.ana}`,
      'publicProfiles/ana',
    ]) {
      expect(await exists(path), path).toBe(false);
    }
    // Lo de los demás sigue en su sitio.
    expect(await exists('users/bea')).toBe(true);
    expect(await exists(`friendCodes/${codes.bea}`)).toBe(true);
    // Y repetirlo no falla (por si se cortó a medias).
    await wipeAccountData(db('ana'), 'ana');
  });

  it('nadie puede borrar los datos de otra cuenta con el mismo flujo', async () => {
    await assertFails(wipeAccountData(db('cai'), 'ana'));
    expect(await exists('users/ana')).toBe(true);
  });
});
