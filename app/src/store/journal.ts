import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import { journal } from '@/db';

/*
 * Estado del cuaderno en memoria, reflejo de `cuaderno.db`.
 *
 * La base es la fuente de verdad; este almacén existe para que todas las
 * pantallas se enteren al instante de un fichaje o de una especie guardada
 * (el Bestiario repinta el cromo, el Atlas añade la capa) sin volver a
 * consultar cada una por su cuenta.
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
};

export type NewSighting = Omit<Sighting, 'id' | 'created_at' | 'verified'> & { verified: boolean };

/** Tonos de las capas del Atlas: ocho matices que se distinguen entre sí y del mapa. */
export const LAYER_HUES = [8, 32, 205, 280, 150, 330, 48, 185];

type State = {
  loaded: boolean;
  caught: Map<number, number>;
  saved: Map<number, number>;
  lastSightingAt: string | null;
  load: () => Promise<void>;
  addSighting: (s: NewSighting) => Promise<Sighting>;
  removeSighting: (id: string) => Promise<void>;
  toggleSaved: (speciesId: number) => Promise<boolean>;
  touchRecent: (speciesId: number) => Promise<void>;
};

export const useJournal = create<State>((set, get) => ({
  loaded: false,
  caught: new Map(),
  saved: new Map(),
  lastSightingAt: null,

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
    const row: Sighting = {
      ...input,
      id: Crypto.randomUUID(),
      created_at: new Date().toISOString(),
      verified: input.verified ? 1 : 0,
    };
    await journal().runAsync(
      `INSERT INTO sighting (id, species_id, breed_id, created_at, lat, lng, accuracy, place, photo, sticker,
         method, confidence, candidates, verified, model, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      ],
    );
    if (row.species_id != null) {
      const caught = new Map(get().caught);
      caught.set(row.species_id, (caught.get(row.species_id) ?? 0) + 1);
      set({ caught, lastSightingAt: row.created_at });
    }
    return row;
  },

  async removeSighting(id) {
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
