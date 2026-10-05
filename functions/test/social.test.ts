import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import functionsTest from 'firebase-functions-test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as social from '../src/social';

/*
 * Lógica de amigos contra el emulador de Firestore (el Admin SDK lo usa solo
 * porque `firebase emulators:exec` define FIRESTORE_EMULATOR_HOST).
 */

process.env.GCLOUD_PROJECT ??= 'demo-zarpa';
const t = functionsTest({ projectId: 'demo-zarpa' });

let db: Firestore;

const call = async <T>(fn: unknown, uid: string | null, data: unknown): Promise<T> => {
  const wrapped = t.wrap(fn as never) as unknown as (req: unknown) => Promise<T>;
  return wrapped({ data, auth: uid ? { uid, token: {} } : undefined, rawRequest: {} });
};

beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-zarpa' });
  db = getFirestore();
});

afterAll(() => t.cleanup());

beforeEach(async () => {
  await db.recursiveDelete(db.collection('users'));
  await db.recursiveDelete(db.collection('friendCodes'));
  for (const [uid, alias] of [
    ['ana', 'Ana'],
    ['bea', 'Bea'],
    ['cai', 'Cai'],
  ]) {
    await db.doc(`users/${uid}`).set({ alias, photoURL: null, counters: { sightings: 0, species: 0 } });
  }
});

async function codeOf(uid: string): Promise<string> {
  return social.ensureFriendCode(db, uid);
}

describe('códigos de amigo', () => {
  it('genera códigos de 8 caracteres sin letras ambiguas', () => {
    for (let i = 0; i < 200; i++) {
      const c = social.makeFriendCode();
      expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it('normaliza lo que teclea la persona', () => {
    expect(social.normalizeCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(social.normalizeCode('ABCDEFG0')).toBeNull(); // el 0 no existe
    expect(social.normalizeCode('ABC')).toBeNull();
    expect(social.normalizeCode(42)).toBeNull();
  });

  it('asigna un código único y estable por cuenta', async () => {
    const a1 = await codeOf('ana');
    const a2 = await codeOf('ana');
    const b = await codeOf('bea');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect((await db.doc(`friendCodes/${a1}`).get()).get('uid')).toBe('ana');
  });
});

describe('solicitudes y amistades', () => {
  it('pide, acepta y quedan como amigos en los dos sentidos', async () => {
    const code = await codeOf('bea');
    const sent = await call<{ status: string }>(social.sendFriendRequest, 'ana', { code });
    expect(sent.status).toBe('sent');
    const req = await db.doc('users/bea/friendRequests/ana').get();
    expect(req.get('alias')).toBe('Ana');

    const res = await call<{ status: string }>(social.respondFriendRequest, 'bea', { from: 'ana', accept: true });
    expect(res.status).toBe('friends');
    expect((await db.doc('users/ana/friends/bea').get()).get('alias')).toBe('Bea');
    expect((await db.doc('users/bea/friends/ana').get()).get('alias')).toBe('Ana');
    expect((await db.doc('users/bea/friendRequests/ana').get()).exists).toBe(false);
  });

  it('si los dos se lo piden, se aceptan solos', async () => {
    await call(social.sendFriendRequest, 'ana', { code: await codeOf('bea') });
    const second = await call<{ status: string }>(social.sendFriendRequest, 'bea', { code: await codeOf('ana') });
    expect(second.status).toBe('friends');
    expect((await db.doc('users/ana/friends/bea').get()).exists).toBe(true);
  });

  it('rechazar borra la solicitud sin crear amistad', async () => {
    await call(social.sendFriendRequest, 'ana', { code: await codeOf('bea') });
    await call(social.respondFriendRequest, 'bea', { from: 'ana', accept: false });
    expect((await db.doc('users/bea/friendRequests/ana').get()).exists).toBe(false);
    expect((await db.doc('users/bea/friends/ana').get()).exists).toBe(false);
  });

  it('rechaza códigos falsos, el propio y llamadas sin cuenta', async () => {
    await expect(call(social.sendFriendRequest, 'ana', { code: 'ZZZZZZZZ' })).rejects.toThrow(/nadie/);
    await expect(call(social.sendFriendRequest, 'ana', { code: await codeOf('ana') })).rejects.toThrow(/propio/);
    await expect(call(social.sendFriendRequest, null, { code: await codeOf('bea') })).rejects.toThrow(/sesión/);
    await expect(call(social.sendFriendRequest, 'ana', { code: '<script>' })).rejects.toThrow(/válido/);
  });

  it('quitar a un amigo lo quita de los dos lados', async () => {
    await call(social.sendFriendRequest, 'ana', { code: await codeOf('bea') });
    await call(social.respondFriendRequest, 'bea', { from: 'ana', accept: true });
    await call(social.removeFriend, 'ana', { uid: 'bea' });
    expect((await db.doc('users/ana/friends/bea').get()).exists).toBe(false);
    expect((await db.doc('users/bea/friends/ana').get()).exists).toBe(false);
  });

  it('al borrar la cuenta no deja rastro en los demás', async () => {
    await call(social.sendFriendRequest, 'ana', { code: await codeOf('bea') });
    await call(social.respondFriendRequest, 'bea', { from: 'ana', accept: true });
    await call(social.sendFriendRequest, 'ana', { code: await codeOf('cai') });
    const anaCode = await codeOf('ana');
    await social.cleanupSocial(db, 'ana');
    expect((await db.doc('users/bea/friends/ana').get()).exists).toBe(false);
    expect((await db.doc('users/cai/friendRequests/ana').get()).exists).toBe(false);
    expect((await db.doc(`friendCodes/${anaCode}`).get()).exists).toBe(false);
  });
});

describe('perfil público', () => {
  it('solo copia alias, avatar, si comparte y contadores', () => {
    expect(social.publicFrom({ alias: 'Ana', photoURL: null, email: 'a@b.c', shareAlbum: true, counters: { sightings: 3, species: 2 } })).toEqual({
      alias: 'Ana',
      photoURL: null,
      shareAlbum: true,
      sightings: 3,
      species: 2,
    });
    expect(social.publicFrom(undefined).alias).toBe('Explorador');
  });
});
