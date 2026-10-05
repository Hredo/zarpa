import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import { journal } from '@/db';
import { dayPhase } from '@/lib/dayPhase';
import { removeVoiceFile } from '@/lib/voiceFiles';
import type { WeatherFields } from '@/lib/weather';

/*
 * Estado del cuaderno en memoria, reflejo de `cuaderno.db`.
 *
 * La base es la fuente de verdad; este almacén existe para que todas las
 * pantallas se enteren al instante de un fichaje o de una especie guardada
 * (el Bestiario repinta el cromo, el Atlas añade la capa) sin volver a
 * consultar cada una por su cuenta.
 *
 * Campos del diario de campo (migración 3, todos opcionales y NULL en los
 * avistamientos anteriores; los lee también la sincronización):
 *   note             texto libre del usuario (ya existía).
 *   voice_note       nota de voz: ruta relativa a `Paths.document`
 *                    (`notas-voz/<id>-<ms>.m4a`), nunca absoluta.
 *   voice_ms         duración de la nota de voz (ms).
 *   weather_code     código WMO del cielo · weather_temp / weather_feels (°C)
 *   weather_humidity (%) · weather_wind (km/h) · weather_is_day (0/1)
 *   weather_at       instante de la medida (ISO UTC); Open-Meteo.
 *   day_phase        amanecer | manana | mediodia | tarde | atardecer | noche.
 *   updated_at       última edición (ISO UTC); `updateSighting` lo actualiza.
 * Un `addSighting` antiguo (sin estos campos) sigue funcionando: se rellenan
 * `day_phase` y `updated_at` solos y el resto queda NULL.
 */

export type Sighting = {
  id: string;
  species_id: number | null;
  breed_id: string | null;
  created_at: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  place: string | null;
  photo: string;
  sticker: string | null;
  method: 'ia' | 'manual';
  confidence: number | null;
  candidates: string | null;
  verified: number;
  model: string | null;
  note: string | null;
} & DiaryFields;

export type DiaryFields = WeatherFields & {
  voice_note: string | null;
  voice_ms: number | null;
  day_phase: string | null;
  updated_at: string | null;
  /** Observación de iNaturalist a la que se aportó (migración 5). */
  inat_id?: number | null;
  inat_uploaded_at?: string | null;
};

export type NewSighting = Omit<Sighting, 'id' | 'created_at' | 'verified' | keyof DiaryFields> & {
  verified: boolean;
} & Partial<DiaryFields>;

/** Campos que el usuario o la app pueden cambiar después de fichar. */
export type SightingPatch = Partial<
  Pick<Sighting, 'note' | 'voice_note' | 'voice_ms' | 'breed_id' | 'place' | 'inat_id' | 'inat_uploaded_at'> & WeatherFields
>;

/** Tonos de las capas del Atlas: ocho matices que se distinguen entre sí y del mapa. */
export const LAYER_HUES = [8, 32, 205, 280, 150, 330, 48, 185];

type State = {
  loaded: boolean;
  caught: Map<number, number>;
  saved: Map<number, number>;
  lastSightingAt: string | null;
  /** Última edición de un avistamiento ya fichado (notas, voz, clima…): avisa a la sincronización. */
  editedAt: string | null;
  load: () => Promise<void>;
  addSighting: (s: NewSighting) => Promise<Sighting>;
  updateSighting: (id: string, patch: SightingPatch) => Promise<void>;
  removeSighting: (id: string) => Promise<void>;
  toggleSaved: (speciesId: number) => Promise<boolean>;
  touchRecent: (speciesId: number) => Promise<void>;
};

export const useJournal = create<State>((set, get) => ({
  loaded: false,
  caught: new Map(),
  saved: new Map(),
  lastSightingAt: null,
  editedAt: null,

  async load() {
    const db = journal();
    const caughtRows = await db.getAllAsync<{ species_id: number; n: number }>(
      'SELECT species_id, COUNT(*) AS n FROM sighting WHERE species_id IS NOT NULL GROUP BY species_id',
    );
    const savedRows = await db.getAllAsync<{ species_id: number; hue: number }>('SELECT species_id, hue FROM saved');
    const last = await db.getFirstAsync<{ created_at: string }>(
      'SELECT created_at FROM sighting ORDER BY created_at DESC LIMIT 1',
    );
    set({
      loaded: true,
      caught: new Map(caughtRows.map((r) => [r.species_id, r.n])),
      saved: new Map(savedRows.map((r) => [r.species_id, r.hue])),
      lastSightingAt: last?.created_at ?? null,
    });
  },

  async addSighting(input) {
    const now = new Date();
    const row: Sighting = {
      voice_note: null,
      voice_ms: null,
      weather_code: null,
      weather_temp: null,
      weather_feels: null,
      weather_humidity: null,
      weather_wind: null,
      weather_is_day: null,
      weather_at: null,
      ...input,
      id: Crypto.randomUUID(),
      created_at: now.toISOString(),
      day_phase: input.day_phase ?? dayPhase(now),
      updated_at: now.toISOString(),
      verified: input.verified ? 1 : 0,
    };
    await journal().runAsync(
      `INSERT INTO sighting (id, species_id, breed_id, created_at, lat, lng, accuracy, place, photo, sticker,
         method, confidence, candidates, verified, model, note,
         voice_note, voice_ms, weather_code, weather_temp, weather_feels, weather_humidity, weather_wind,
         weather_is_day, weather_at, day_phase, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.id,
        row.species_id,
        row.breed_id,
        row.created_at,
        row.lat,
        row.lng,
        row.accuracy,
        row.place,
        row.photo,
        row.sticker,
        row.method,
        row.confidence,
        row.candidates,
        row.verified,
        row.model,
        row.note,
        row.voice_note,
        row.voice_ms,
        row.weather_code,
        row.weather_temp,
        row.weather_feels,
        row.weather_humidity,
        row.weather_wind,
        row.weather_is_day,
        row.weather_at,
        row.day_phase,
        row.updated_at,
      ],
    );
    if (row.species_id != null) {
      const caught = new Map(get().caught);
      caught.set(row.species_id, (caught.get(row.species_id) ?? 0) + 1);
      set({ caught, lastSightingAt: row.created_at });
    }
    return row;
  },

  async updateSighting(id, patch) {
    const cols = Object.keys(patch) as (keyof SightingPatch)[];
    if (cols.length === 0) return;
    // Los nombres de columna salen del tipo `SightingPatch`, nunca de texto del usuario.
    const sets = cols.map((c) => `${c} = ?`).join(', ');
    const now = new Date().toISOString();
    await journal().runAsync(`UPDATE sighting SET ${sets}, updated_at = ? WHERE id = ?`, [...cols.map((c) => patch[c] ?? null), now, id]);
    set({ editedAt: now });
  },

  async removeSighting(id) {
    const voice = await journal().getFirstAsync<{ voice_note: string | null }>('SELECT voice_note FROM sighting WHERE id = ?', [id]);
    removeVoiceFile(voice?.voice_note);
    await journal().runAsync('DELETE FROM sighting WHERE id = ?', [id]);
    await get().load();
  },

  async toggleSaved(speciesId) {
    const saved = new Map(get().saved);
    if (saved.has(speciesId)) {
      await journal().runAsync('DELETE FROM saved WHERE species_id = ?', [speciesId]);
      saved.delete(speciesId);
      set({ saved });
      return false;
    }
    // El tono se elige entre los que no usa ya otra capa, para que dos especies
    // guardadas nunca se pinten igual en el Atlas mientras quepan.
    const used = new Set(saved.values());
    const hue = LAYER_HUES.find((h) => !used.has(h)) ?? LAYER_HUES[saved.size % LAYER_HUES.length];
    await journal().runAsync('INSERT OR REPLACE INTO saved (species_id, saved_at, hue) VALUES (?,?,?)', [
      speciesId,
      new Date().toISOString(),
      hue,
    ]);
    saved.set(speciesId, hue);
    set({ saved });
    return true;
  },

  async touchRecent(speciesId) {
    await journal().runAsync('INSERT OR REPLACE INTO recent (species_id, viewed_at) VALUES (?,?)', [
      speciesId,
      new Date().toISOString(),
    ]);
  },
}));

export async function listSightings(limit = 200, offset = 0): Promise<Sighting[]> {
  return journal().getAllAsync<Sighting>('SELECT * FROM sighting ORDER BY created_at DESC LIMIT ? OFFSET ?', [
    limit,
    offset,
  ]);
}

export async function getSighting(id: string): Promise<Sighting | null> {
  return journal().getFirstAsync<Sighting>('SELECT * FROM sighting WHERE id = ?', [id]);
}

export async function sightingsOf(speciesId: number): Promise<Sighting[]> {
  return journal().getAllAsync<Sighting>('SELECT * FROM sighting WHERE species_id = ? ORDER BY created_at DESC', [
    speciesId,
  ]);
}
