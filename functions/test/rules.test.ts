import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
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
  // El perfil lo crea el servidor: aquí se siembra saltándose las reglas.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/ana'), { alias: 'Ana', photoURL: null, createdAt: new Date(), counters: { sightings: 0 } });
    await setDoc(doc(ctx.firestore(), 'users/bea'), { alias: 'Bea', photoURL: null, createdAt: new Date(), counters: { sightings: 0 } });
  });
});

const ana = () => env.authenticatedContext('ana').firestore();
const bea = () => env.authenticatedContext('bea').firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('perfil', () => {
  it('el dueño lee su perfil; los demás y los anónimos no', async () => {
    await assertSucceeds(getDoc(doc(ana(), 'users/ana')));
    await assertFails(getDoc(doc(bea(), 'users/ana')));
    await assertFails(getDoc(doc(anon(), 'users/ana')));
  });

  it('el dueño cambia alias y foto, con updatedAt del servidor', async () => {
    await assertSucceeds(updateDoc(doc(ana(), 'users/ana'), { alias: 'Ana M.', photoURL: 'https://x.test/a.jpg', updatedAt: serverTimestamp() }));
  });

  it('rechaza alias vacío, largo o de otro tipo', async () => {
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { alias: '', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { alias: 'x'.repeat(41), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { alias: 7, updatedAt: serverTimestamp() }));
  });

  it('no deja falsear contadores ni la fecha de alta', async () => {
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { 'counters.sightings': 9999, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ana(), 'users/ana'), { createdAt: new Date(), updatedAt: serverTimestamp() }));
  });

  it('el cliente no crea ni borra perfiles', async () => {
    await assertFails(setDoc(doc(env.authenticatedContext('cai').firestore(), 'users/cai'), { alias: 'Cai' }));
    await assertFails(deleteDoc(doc(ana(), 'users/ana')));
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

describe('lo social sigue cerrado', () => {
  it('nadie lee ni escribe publicProfiles, follows ni colecciones desconocidas', async () => {
    await assertFails(getDoc(doc(ana(), 'publicProfiles/ana')));
    await assertFails(setDoc(doc(ana(), 'publicProfiles/ana'), { alias: 'Ana' }));
    await assertFails(setDoc(doc(ana(), 'follows/ana_bea'), { a: 1 }));
    await assertFails(setDoc(doc(ana(), 'cualquiera/x'), { a: 1 }));
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
