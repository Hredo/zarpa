import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { create } from 'zustand';

import type { Sighting } from '@/store/journal';

/*
 * Aportar avistamientos a iNaturalist (y, a través de él, a GBIF: las
 * observaciones que la comunidad confirma como «grado de investigación» se
 * publican en GBIF cada semana).
 *
 * Acceso: OAuth 2 con PKCE, sin secreto en la app (la aplicación registrada en
 * iNaturalist debe ser «no confidencial»). El token de acceso se guarda en el
 * almacén seguro del sistema (Keychain / Keystore) y nunca sale del móvil salvo
 * hacia iNaturalist. Con él se pide el JWT de la API (vale 24 h).
 *
 *   EXPO_PUBLIC_INAT_CLIENT_ID   id público de la aplicación en iNaturalist
 *   redirect                     zarpa://inaturalist
 */

const SITE = 'https://www.inaturalist.org';
const API = 'https://api.inaturalist.org/v1';
const CLIENT_ID = process.env.EXPO_PUBLIC_INAT_CLIENT_ID ?? '';
export const INAT_REDIRECT = 'zarpa://inaturalist';
const STORE_KEY = 'zarpa.inat';

export const inatEnabled = CLIENT_ID.length > 0;

type Saved = { token: string; login: string; icon: string | null };

type State = { status: 'unknown' | 'disconnected' | 'connected'; login: string | null; icon: string | null; busy: boolean };

export const useInat = create<State>(() => ({ status: 'unknown', login: null, icon: null, busy: false }));

export class InatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InatError';
  }
}

export class InatCancelled extends Error {}

// ---- PKCE ---------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Base64 «url» sin relleno (RFC 7636). */
export function base64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(Crypto.getRandomBytes(32));
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/** Parámetros de la URL de vuelta (`zarpa://inaturalist?code=…&state=…`). */
export function parseRedirect(url: string): Record<string, string> {
  const q = url.split('?')[1]?.split('#')[0] ?? '';
  const out: Record<string, string> = {};
  for (const part of q.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

// ---- Sesión -------------------------------------------------------------------

async function readSaved(): Promise<Saved | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

/** Carga el estado guardado (una vez, al abrir pantallas que lo usan). */
export async function loadInat(): Promise<void> {
  if (useInat.getState().status !== 'unknown') return;
  const saved = await readSaved();
  useInat.setState(saved ? { status: 'connected', login: saved.login, icon: saved.icon } : { status: 'disconnected', login: null, icon: null });
}

let jwt: { token: string; until: number } | null = null;

async function apiToken(): Promise<string> {
  if (jwt && jwt.until > Date.now()) return jwt.token;
  const saved = await readSaved();
  if (!saved) throw new InatError('Conecta tu cuenta de iNaturalist.');
  const res = await fetch(`${SITE}/users/api_token`, { headers: { Authorization: `Bearer ${saved.token}`, Accept: 'application/json' } });
  if (res.status === 401) {
    await disconnectInat();
    throw new InatError('La conexión con iNaturalist ha caducado. Vuelve a conectar tu cuenta.');
  }
  if (!res.ok) throw new InatError('iNaturalist no responde. Inténtalo más tarde.');
  const { api_token } = (await res.json()) as { api_token: string };
  jwt = { token: api_token, until: Date.now() + 23 * 60 * 60 * 1000 };
  return api_token;
}

/** Abre iNaturalist para autorizar a Zarpa y guarda el acceso. */
export async function connectInat(): Promise<void> {
  if (!inatEnabled) throw new InatError('La conexión con iNaturalist aún no está configurada.');
  useInat.setState({ busy: true });
  try {
    const { verifier, challenge } = await pkcePair();
    const state = base64Url(Crypto.getRandomBytes(12));
    const url =
      `${SITE}/oauth/authorize?client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent(INAT_REDIRECT)}` +
      `&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;
    const res = await WebBrowser.openAuthSessionAsync(url, INAT_REDIRECT);
    if (res.type !== 'success') throw new InatCancelled();
    const params = parseRedirect(res.url);
    if (params.state !== state || !params.code) throw new InatError('iNaturalist no devolvió la autorización. Inténtalo de nuevo.');

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      code: params.code,
      redirect_uri: INAT_REDIRECT,
      code_verifier: verifier,
      grant_type: 'authorization_code',
    }).toString();
    const tok = await fetch(`${SITE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
    if (!tok.ok) throw new InatError('iNaturalist rechazó la conexión. Inténtalo de nuevo.');
    const { access_token } = (await tok.json()) as { access_token: string };

    jwt = null;
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify({ token: access_token, login: '', icon: null } satisfies Saved));
    const me = await fetch(`${API}/users/me`, { headers: { Authorization: await apiToken() } });
    const user = me.ok ? ((await me.json()) as { results: { login: string; icon_url: string | null }[] }).results[0] : null;
    const saved: Saved = { token: access_token, login: user?.login ?? '', icon: user?.icon_url ?? null };
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(saved));
    useInat.setState({ status: 'connected', login: saved.login, icon: saved.icon });
  } finally {
    useInat.setState({ busy: false });
  }
}

export async function disconnectInat(): Promise<void> {
  jwt = null;
  await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
  useInat.setState({ status: 'disconnected', login: null, icon: null });
}

// ---- Publicar -------------------------------------------------------------------

/** Cuerpo de la observación (puro: se prueba sin red). */
export function observationBody(s: Sighting, opts: { obscure: boolean; sci?: string | null }) {
  return {
    observation: {
      taxon_id: s.species_id,
      species_guess: opts.sci ?? undefined,
      observed_on_string: s.created_at,
      latitude: s.lat ?? undefined,
      longitude: s.lng ?? undefined,
      positional_accuracy: s.accuracy != null ? Math.round(s.accuracy) : undefined,
      geoprivacy: opts.obscure ? 'obscured' : 'open',
      description: s.note?.trim() ? s.note.trim() : undefined,
      // Si la propuso la IA de Zarpa, iNaturalist lo anota como «sugerida por visión artificial».
      owners_identification_from_vision: s.method === 'ia',
    },
  };
}

/** ¿Se puede aportar? Hace falta especie, fecha y lugar (iNaturalist lo pide para ser «investigación»). */
export function canContribute(s: Pick<Sighting, 'species_id' | 'lat' | 'lng' | 'photo'>): boolean {
  return s.species_id != null && s.lat != null && s.lng != null && !!s.photo;
}

/**
 * Publica el avistamiento con su foto. Devuelve el id de la observación y si la
 * foto llegó (si falla, la observación ya existe: se guarda igual el id).
 */
export async function uploadToInat(s: Sighting, opts: { obscure: boolean; sci?: string | null }): Promise<{ id: number; photo: boolean }> {
  const token = await apiToken();
  const res = await fetch(`${API}/observations`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(observationBody(s, opts)),
  });
  if (!res.ok) throw new InatError(res.status === 422 ? 'iNaturalist no aceptó los datos del avistamiento.' : 'No se pudo publicar. Inténtalo más tarde.');
  const obs = (await res.json()) as { id?: number; results?: { id: number }[] };
  const id = obs.id ?? obs.results?.[0]?.id;
  if (!id) throw new InatError('iNaturalist no devolvió la observación.');

  const form = new FormData();
  form.append('observation_photo[observation_id]', String(id));
  // React Native sube ficheros locales con { uri, name, type }.
  form.append('file', { uri: s.photo, name: `zarpa-${s.id}.jpg`, type: 'image/jpeg' } as unknown as Blob);
  const photo = await fetch(`${API}/observation_photos`, { method: 'POST', headers: { Authorization: token, Accept: 'application/json' }, body: form }).catch(
    () => null,
  );
  return { id, photo: !!photo?.ok };
}

export const inatObservationUrl = (id: number) => `${SITE}/observations/${id}`;
