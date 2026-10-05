import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Pruebas de las reglas de Firestore y Storage contra los emuladores.
 * Se lanzan con `pnpm test` (firebase emulators:exec levanta los emuladores).
 */

const root = resolve(__dirname, '..', '..');
let env: RulesTestEnvironment;

const profile = (alias: string, over: Record<string, unknown> = {}) => ({
  alias,
  photoURL: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  counters: { sightings: 0, species: 0 },
  shareAlbum: false,
  ...over,
});

const sighting = (over: Record<string, unknown> = {}) => ({
  species_id: 123,
  breed_id: null,
  created_at: '2026-10-05T10:00:00.000Z',
  lat: 40.4,
  lng: -3.7,
  accuracy: 12,
  place: 'Casa de Campo',
  method: 'ia',
  confidence: 0.91,
  candidates: '[1,2,3]',
  verified: 0,
  model: 'zarpa-1',
  note: null,
  has_photo: true,
  ...over,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-zarpa',
    firestore: { rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(resolve(root, 'storage.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  // Perfiles ya creados (la creación tiene sus propias pruebas).
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/ana'), profile('Ana'));
    await setDoc(doc(ctx.firestore(), 'users/bea'), profile('Bea'));
  });
});

const ana = () => env.authenticatedContext('ana').firestore();
const bea = () => env.authenticatedContext('bea').firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('perfil', () => {
  const cai = () => env.authenticatedContext('cai').firestore();
  const fresh = (over: Record<string, unknown> = {}) => ({
    alias: 'Cai',
    photoURL: 'https://lh3.googleusercontent.com/a/cai',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    counters: { sightings: 0, species: 0 },
    shareAlbum: false,
    ...over,
  });

  it('el dueño lee su perfil; los demás y los anónimos no', async () => {
    await assertSucceeds(getDoc(doc(ana(), 'users/ana')));
    await assertFails(getDoc(doc(bea(), 'users/ana')));
    await assertFails(getDoc(doc(anon(), 'users/ana')));
  });

  it('la app crea el perfil al entrar, solo con la forma de partida', async () => {
    await assertFails(setDoc(doc(cai(), 'users/cai'), fresh({ counters: { sightings: 99, species: 0 } })));
    await assertFails(setDoc(doc(cai(), 'users/cai'), fresh({ shareAlbum: true })));
    await assertFails(setDoc(doc(cai(), 'users/cai'), fresh({ friendCode: 'ABCDEFGH' })));
    await assertFails(setDoc(doc(cai(), 'users/cai'), fresh({ admin: true })));
    await assertFails(setDoc(doc(cai(), 'users/cai'), fresh({ createdAt: new Date(2020, 0, 1) })));
    await assertFails(setDoc(doc(cai(), 'users/cai'), fresh({ alias: '' })));
    await assertFails(setDoc(doc(cai(), 'users/cai'), fresh({ photoURL: 'http://inseguro.test/a.jpg' })));
    await assertFails(setDoc(doc(ana(), 'users/cai'), fresh()));
    await assertSucceeds(setDoc(doc(cai(), 'users/cai'), fresh()));
  });

  it('el dueño cambia alias y foto, con updatedAt del servidor', async () => {
    await assertSucceeds(updateDoc(doc(ana(), 'users/ana'), { alias: 'Ana M.', photoURL: 'https://x.test/a.jpg', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { alias: 'Ana M.', updatedAt: new Date() }));
  });

  it('rechaza alias vacío, largo o de otro tipo', async () => {
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { alias: '', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { alias: 'x'.repeat(41), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { alias: 7, updatedAt: serverTimestamp() }));
  });

  it('los contadores los pone la app tras sincronizar, siempre enteros y no negativos', async () => {
    await assertSucceeds(updateDoc(doc(ana(), 'users/ana'), { counters: { sightings: 12, species: 5 }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { counters: { sightings: -1, species: 5 }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { counters: { sightings: 1.5, species: 1 }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { counters: { sightings: 1, species: 1, medals: 9 }, updatedAt: serverTimestamp() }));
  });

  it('no deja cambiar la fecha de alta ni añadir campos', async () => {
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { createdAt: new Date(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { role: 'admin', updatedAt: serverTimestamp() }));
  });

  it('el dueño borra su perfil (al borrar la cuenta); nadie más', async () => {
    await assertFails(deleteDoc(doc(bea(), 'users/ana')));
    await assertSucceeds(deleteDoc(doc(ana(), 'users/ana')));
  });

  it('un usuario no toca el perfil de otro', async () => {
    await assertFails(updateDoc(doc(bea(), 'users/ana'), { alias: 'Hackeada', updatedAt: serverTimestamp() }));
  });
});

describe('ajustes privados', () => {
  it('solo el dueño lee y escribe settings; no hay otros documentos', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/private/settings'), { kids: false }));
    await assertSucceeds(getDoc(doc(ana(), 'users/ana/private/settings')));
    await assertFails(getDoc(doc(bea(), 'users/ana/private/settings')));
    await assertFails(setDoc(doc(bea(), 'users/ana/private/settings'), { kids: true }));
    await assertFails(setDoc(doc(ana(), 'users/ana/private/otro'), { a: 1 }));
    await assertFails(deleteDoc(doc(bea(), 'users/ana/private/settings')));
    await assertSucceeds(deleteDoc(doc(ana(), 'users/ana/private/settings')));
  });
});

describe('avistamientos', () => {
  const path = 'users/ana/sightings/3f2c-aa';

  it('el dueño crea, lee, actualiza y borra', async () => {
    await assertSucceeds(setDoc(doc(ana(), path), sighting()));
    await assertSucceeds(getDoc(doc(ana(), path)));
    await assertSucceeds(setDoc(doc(ana(), path), sighting({ note: 'Con crías' })));
    await assertSucceeds(deleteDoc(doc(ana(), path)));
  });

  it('otro usuario y los anónimos no leen ni escriben', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), path), sighting()));
    await assertFails(getDoc(doc(bea(), path)));
    await assertFails(getDoc(doc(anon(), path)));
    await assertFails(setDoc(doc(bea(), path), sighting()));
    await assertFails(deleteDoc(doc(bea(), path)));
  });

  it('valida tipos y rangos', async () => {
    await assertFails(setDoc(doc(ana(), path), sighting({ lat: 91 })));
    await assertFails(setDoc(doc(ana(), path), sighting({ lng: -181 })));
    await assertFails(setDoc(doc(ana(), path), sighting({ confidence: 1.5 })));
    await assertFails(setDoc(doc(ana(), path), sighting({ method: 'telepatia' })));
    await assertFails(setDoc(doc(ana(), path), sighting({ verified: 2 })));
    await assertFails(setDoc(doc(ana(), path), sighting({ species_id: 'zorro' })));
    await assertFails(setDoc(doc(ana(), path), sighting({ created_at: 20261005 })));
    await assertFails(setDoc(doc(ana(), path), sighting({ has_photo: 'si' })));
  });

  it('valida tamaños', async () => {
    await assertFails(setDoc(doc(ana(), path), sighting({ note: 'x'.repeat(5001) })));
    await assertFails(setDoc(doc(ana(), path), sighting({ place: 'x'.repeat(301) })));
    await assertSucceeds(setDoc(doc(ana(), path), sighting({ note: 'x'.repeat(5000) })));
  });

  it('exige los campos obligatorios', async () => {
    const { method: _m, ...sinMetodo } = sighting();
    await assertFails(setDoc(doc(ana(), path), sinMetodo));
  });

  it('admite campos nuevos del cuaderno (hasta 40) pero no una avalancha', async () => {
    await assertSucceeds(setDoc(doc(ana(), path), sighting({ weather: '{"t":18}', audio_seconds: 4 })));
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`extra${i}`, i]));
    await assertFails(setDoc(doc(ana(), path), sighting(many)));
  });

  it('admite el diario de campo y los ficheros de pegatina y voz', async () => {
    const diario = {
      has_sticker: true,
      sticker_ext: 'png',
      has_voice: true,
      voice_ext: 'm4a',
      voice_ms: 4200,
      weather_code: 61,
      weather_temp: 14.5,
      weather_feels: 12,
      weather_humidity: 88,
      weather_wind: 21,
      weather_is_day: 1,
      weather_at: '2026-10-05T10:00',
      day_phase: 'manana',
      updated_at: '2026-10-05T10:05:00.000Z',
      schema: 3,
      synced_at: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(ana(), path), sighting(diario)));
    await assertFails(setDoc(doc(ana(), path), sighting({ ...diario, sticker_ext: 'gif' })));
    await assertFails(setDoc(doc(ana(), path), sighting({ ...diario, voice_ext: 'exe' })));
    await assertFails(setDoc(doc(ana(), path), sighting({ ...diario, has_voice: 'si' })));
    await assertFails(setDoc(doc(ana(), path), sighting({ ...diario, weather_humidity: 140 })));
    await assertFails(setDoc(doc(ana(), path), sighting({ ...diario, day_phase: 'madrugada' })));
    await assertFails(setDoc(doc(ana(), path), sighting({ ...diario, voice_ms: -1 })));
  });

  it('rechaza ids con caracteres raros', async () => {
    await assertFails(setDoc(doc(ana(), 'users/ana/sightings/a b'), sighting()));
  });
});

describe('lo social', () => {
  const album = (over: Record<string, unknown> = {}) => ({
    species_id: 42,
    count: 3,
    first: '2026-04',
    last: '2026-10',
    sticker: '3f2c-aa',
    sticker_ext: 'png',
    updated_at: '2026-10-05T10:00:00.000Z',
    ...over,
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const f = ctx.firestore();
      await setDoc(doc(f, 'users/ana'), profile('Ana', { shareAlbum: true, friendCode: 'ABCDEFGH' }));
      await setDoc(doc(f, 'users/cai'), profile('Cai'));
      await setDoc(doc(f, 'users/ana/friends/bea'), { alias: 'Bea', photoURL: null, since: new Date() });
      await setDoc(doc(f, 'users/bea/friends/ana'), { alias: 'Ana', photoURL: null, since: new Date() });
      await setDoc(doc(f, 'users/ana/album/42'), album());
      await setDoc(doc(f, 'users/ana/friendRequests/cai'), { from: 'cai', alias: 'Cai', photoURL: null, at: new Date() });
      await setDoc(doc(f, 'publicProfiles/ana'), { alias: 'Ana', photoURL: null, shareAlbum: true, sightings: 0, species: 0, updatedAt: new Date() });
      await setDoc(doc(f, 'friendCodes/ABCDEFGH'), { uid: 'ana', createdAt: new Date() });
    });
  });

  const cai = () => env.authenticatedContext('cai').firestore();
  const request = (from: string, alias: string) => ({ from, alias, photoURL: null, at: serverTimestamp() });
  const edge = (alias: string) => ({ alias, photoURL: null, since: serverTimestamp() });

  it('el dueño activa y desactiva compartir su álbum', async () => {
    await assertSucceeds(updateDoc(doc(ana(), 'users/ana'), { shareAlbum: false, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { shareAlbum: 'si', updatedAt: serverTimestamp() }));
  });

  it('los amigos ven el álbum compartido; los demás no', async () => {
    await assertSucceeds(getDoc(doc(ana(), 'users/ana/album/42')));
    await assertSucceeds(getDoc(doc(bea(), 'users/ana/album/42')));
    await assertFails(getDoc(doc(cai(), 'users/ana/album/42')));
    await assertFails(getDoc(doc(anon(), 'users/ana/album/42')));
  });

  it('sin compartir, ni los amigos lo ven', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore(), 'users/ana'), { shareAlbum: false }));
    await assertFails(getDoc(doc(bea(), 'users/ana/album/42')));
    await assertFails(setDoc(doc(ana(), 'users/ana/album/7'), album({ species_id: 7 })));
  });

  it('solo el dueño escribe su álbum, y sin lugares ni campos extra', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/album/7'), album({ species_id: 7 })));
    await assertFails(setDoc(doc(bea(), 'users/ana/album/8'), album({ species_id: 8 })));
    await assertFails(setDoc(doc(ana(), 'users/ana/album/9'), album({ species_id: 9, lat: 40.4 })));
    await assertFails(setDoc(doc(ana(), 'users/ana/album/10'), album({ species_id: 11 })));
    await assertFails(setDoc(doc(ana(), 'users/ana/album/12'), album({ species_id: 12, first: 'ayer' })));
    await assertSucceeds(deleteDoc(doc(ana(), 'users/ana/album/42')));
  });

  it('código de amigo: se pone una vez, junto con su índice, y no se puede robar', async () => {
    const claim = (db: ReturnType<typeof cai>, uid: string, code: string) => {
      const batch = writeBatch(db);
      batch.set(doc(db, 'friendCodes', code), { uid, createdAt: serverTimestamp() });
      batch.update(doc(db, 'users', uid), { friendCode: code, updatedAt: serverTimestamp() });
      return batch.commit();
    };
    // El de otra persona, o un código con letras que confunden: no.
    await assertFails(claim(cai(), 'cai', 'ABCDEFGH'));
    await assertFails(claim(cai(), 'cai', 'ABCDEFG0'));
    // Solo el índice, sin el perfil (o al revés): no.
    await assertFails(setDoc(doc(cai(), 'friendCodes/CANCAN22'), { uid: 'cai', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(cai(), 'users/cai'), { friendCode: 'CANCAN22', updatedAt: serverTimestamp() }));
    // A nombre de otro: no.
    await assertFails(
      (async () => {
        const c = cai();
        const batch = writeBatch(c);
        batch.set(doc(c, 'friendCodes/CANCAN22'), { uid: 'bea', createdAt: serverTimestamp() });
        batch.update(doc(c, 'users/cai'), { friendCode: 'CANCAN22', updatedAt: serverTimestamp() });
        await batch.commit();
      })(),
    );
    await assertSucceeds(claim(cai(), 'cai', 'CANCAN22'));
    // Ya tiene uno: no puede cambiarlo.
    await assertFails(claim(cai(), 'cai', 'CANCAN33'));
  });

  it('los códigos se leen de uno en uno, nunca se listan', async () => {
    await assertSucceeds(getDoc(doc(cai(), 'friendCodes/ABCDEFGH')));
    await assertFails(getDoc(doc(anon(), 'friendCodes/ABCDEFGH')));
    await assertFails(getDocs(collection(cai(), 'friendCodes')));
    await assertFails(deleteDoc(doc(cai(), 'friendCodes/ABCDEFGH')));
    await assertSucceeds(deleteDoc(doc(ana(), 'friendCodes/ABCDEFGH')));
  });

  it('solicitudes: las escribe quien pide, a su nombre, a una cuenta que existe', async () => {
    await assertSucceeds(setDoc(doc(cai(), 'users/bea/friendRequests/cai'), request('cai', 'Cai')));
    await assertFails(setDoc(doc(cai(), 'users/bea/friendRequests/ana'), request('ana', 'Ana')));
    await assertFails(setDoc(doc(cai(), 'users/bea/friendRequests/cai'), request('ana', 'Cai')));
    await assertFails(setDoc(doc(cai(), 'users/nadie/friendRequests/cai'), request('cai', 'Cai')));
    await assertFails(setDoc(doc(cai(), 'users/cai/friendRequests/cai'), request('cai', 'Cai')));
    await assertFails(setDoc(doc(cai(), 'users/bea/friendRequests/cai'), { ...request('cai', 'Cai'), lat: 40 }));
  });

  it('solicitudes: las lee quien las recibe; quien las envía solo la suya', async () => {
    await assertSucceeds(getDoc(doc(ana(), 'users/ana/friendRequests/cai')));
    await assertSucceeds(getDoc(doc(cai(), 'users/ana/friendRequests/cai')));
    await assertFails(getDoc(doc(bea(), 'users/ana/friendRequests/cai')));
    await assertFails(getDocs(collection(cai(), 'users/ana/friendRequests')));
    await assertSucceeds(getDocs(query(collectionGroup(cai(), 'friendRequests'), where('from', '==', 'cai'))));
    await assertFails(getDocs(query(collectionGroup(cai(), 'friendRequests'), where('from', '==', 'bea'))));
  });

  it('aceptar: quien recibe la solicitud apunta la amistad en las dos listas', async () => {
    const a = ana();
    const batch = writeBatch(a);
    batch.set(doc(a, 'users/ana/friends/cai'), edge('Cai'));
    batch.set(doc(a, 'users/cai/friends/ana'), edge('Ana'));
    batch.delete(doc(a, 'users/ana/friendRequests/cai'));
    await assertSucceeds(batch.commit());
  });

  it('sin solicitud nadie se cuela en la lista de otro', async () => {
    // Cai no puede apuntarse en la de Bea, ni a Bea en la suya, sin que Bea se lo pida.
    await assertFails(setDoc(doc(cai(), 'users/bea/friends/cai'), edge('Cai')));
    await assertFails(setDoc(doc(cai(), 'users/cai/friends/bea'), edge('Bea')));
    // Ana no aceptó a Cai: Cai no se apunta en la de Ana aunque le pidiera amistad.
    await assertFails(setDoc(doc(cai(), 'users/ana/friends/cai'), edge('Cai')));
    // Fecha falsa o campos de más.
    await assertFails(setDoc(doc(ana(), 'users/ana/friends/cai'), { alias: 'Cai', photoURL: null, since: new Date() }));
    await assertFails(setDoc(doc(ana(), 'users/ana/friends/cai'), { ...edge('Cai'), species: 3 }));
  });

  it('cada amigo refresca su alias en la lista del otro; y cualquiera de los dos rompe la amistad', async () => {
    await assertSucceeds(updateDoc(doc(bea(), 'users/ana/friends/bea'), { alias: 'Bea R.' }));
    await assertFails(updateDoc(doc(bea(), 'users/ana/friends/bea'), { since: new Date() }));
    await assertFails(updateDoc(doc(cai(), 'users/ana/friends/bea'), { alias: 'Falsa' }));
    await assertFails(deleteDoc(doc(cai(), 'users/ana/friends/bea')));
    await assertSucceeds(deleteDoc(doc(bea(), 'users/ana/friends/bea')));
    await assertSucceeds(deleteDoc(doc(bea(), 'users/bea/friends/ana')));
  });

  it('perfiles públicos: los escribe su dueño, con forma fija; los lee quien tiene cuenta, de uno en uno', async () => {
    const pub = { alias: 'Bea', photoURL: null, shareAlbum: false, sightings: 3, species: 2, updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(bea(), 'publicProfiles/bea'), pub));
    await assertFails(setDoc(doc(cai(), 'publicProfiles/bea'), pub));
    await assertFails(setDoc(doc(bea(), 'publicProfiles/bea'), { ...pub, email: 'bea@x.test' }));
    await assertFails(setDoc(doc(bea(), 'publicProfiles/bea'), { ...pub, sightings: -3 }));
    await assertSucceeds(getDoc(doc(cai(), 'publicProfiles/ana')));
    await assertFails(getDoc(doc(anon(), 'publicProfiles/ana')));
    await assertFails(getDocs(collection(cai(), 'publicProfiles')));
    await assertFails(deleteDoc(doc(cai(), 'publicProfiles/ana')));
    await assertSucceeds(deleteDoc(doc(ana(), 'publicProfiles/ana')));
    await assertFails(setDoc(doc(ana(), 'cualquiera/x'), { a: 1 }));
  });

  it('las pegatinas se comparten con los amigos; la foto y la voz, no', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const st = (uid: string) => env.authenticatedContext(uid).storage();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'users/ana/sightings/3f2c-aa.sticker.png'), png, { contentType: 'image/png' });
      await uploadBytes(ref(ctx.storage(), 'users/ana/sightings/3f2c-aa.jpg'), png, { contentType: 'image/jpeg' });
      await uploadBytes(ref(ctx.storage(), 'users/ana/sightings/3f2c-aa.voice.m4a'), png, { contentType: 'audio/mp4' });
    });
    await assertSucceeds(getBytes(ref(st('bea'), 'users/ana/sightings/3f2c-aa.sticker.png')));
    await assertFails(getBytes(ref(st('cai'), 'users/ana/sightings/3f2c-aa.sticker.png')));
    await assertFails(getBytes(ref(st('bea'), 'users/ana/sightings/3f2c-aa.jpg')));
    await assertFails(getBytes(ref(st('bea'), 'users/ana/sightings/3f2c-aa.voice.m4a')));
  });
});

describe('storage', () => {
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const st = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();

  it('el dueño sube, lee y borra su foto JPEG', async () => {
    const r = ref(st('ana'), 'users/ana/sightings/3f2c-aa.jpg');
    await assertSucceeds(uploadBytes(r, jpg, { contentType: 'image/jpeg' }));
    await assertSucceeds(getBytes(r));
    await assertSucceeds(deleteObject(r));
  });

  it('otro usuario o anónimo no leen ni escriben', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'users/ana/sightings/x.jpg'), jpg, { contentType: 'image/jpeg' });
    });
    await assertFails(getBytes(ref(st('bea'), 'users/ana/sightings/x.jpg')));
    await assertFails(getBytes(ref(st(null), 'users/ana/sightings/x.jpg')));
    await assertFails(uploadBytes(ref(st('bea'), 'users/ana/sightings/y.jpg'), jpg, { contentType: 'image/jpeg' }));
    await assertFails(deleteObject(ref(st('bea'), 'users/ana/sightings/x.jpg')));
  });

  it('pegatina PNG (o JPEG) y nota de voz del dueño', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const m4a = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
    await assertSucceeds(uploadBytes(ref(st('ana'), 'users/ana/sightings/3f2c-aa.sticker.png'), png, { contentType: 'image/png' }));
    await assertSucceeds(uploadBytes(ref(st('ana'), 'users/ana/sightings/3f2c-ab.sticker.jpg'), jpg, { contentType: 'image/jpeg' }));
    await assertSucceeds(uploadBytes(ref(st('ana'), 'users/ana/sightings/3f2c-aa.voice.m4a'), m4a, { contentType: 'audio/mp4' }));
    await assertSucceeds(getBytes(ref(st('ana'), 'users/ana/sightings/3f2c-aa.voice.m4a')));
    await assertFails(getBytes(ref(st('bea'), 'users/ana/sightings/3f2c-aa.voice.m4a')));
    await assertFails(uploadBytes(ref(st('bea'), 'users/ana/sightings/3f2c-aa.sticker.png'), png, { contentType: 'image/png' }));
    // Tipo que no casa con la extensión, extensión desconocida o demasiado grande.
    await assertFails(uploadBytes(ref(st('ana'), 'users/ana/sightings/a.sticker.png'), png, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(st('ana'), 'users/ana/sightings/a.voice.m4a'), m4a, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(st('ana'), 'users/ana/sightings/a.voice.exe'), m4a, { contentType: 'audio/mp4' }));
    await assertFails(uploadBytes(ref(st('ana'), 'users/ana/sightings/a.voice.m4a'), new Uint8Array(5 * 1024 * 1024 + 1), { contentType: 'audio/mp4' }));
    await assertSucceeds(deleteObject(ref(st('ana'), 'users/ana/sightings/3f2c-aa.voice.m4a')));
  });

  it('el catálogo es de lectura pública y nadie lo escribe desde la app', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'catalog/manifest.json'), new TextEncoder().encode('{}'), { contentType: 'application/json' });
    });
    await assertSucceeds(getBytes(ref(st(null), 'catalog/manifest.json')));
    await assertFails(uploadBytes(ref(st('ana'), 'catalog/manifest.json'), new TextEncoder().encode('{}'), { contentType: 'application/json' }));
  });

  it('solo JPEG, nombres válidos y hasta 10 MB', async () => {
    await assertFails(uploadBytes(ref(st('ana'), 'users/ana/sightings/a.jpg'), jpg, { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(st('ana'), 'users/ana/sightings/a.png'), jpg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(st('ana'), 'users/ana/otra/a.jpg'), jpg, { contentType: 'image/jpeg' }));
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    await assertFails(uploadBytes(ref(st('ana'), 'users/ana/sightings/big.jpg'), big, { contentType: 'image/jpeg' }));
  });
});
