import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import { journal } from '@/db';
import { summarize } from '@/lib/excursionLogic';

/*
 * Excursión en curso y su historial, en `cuaderno.db` (migración 4):
 *   excursion         una salida: inicio, fin, punto, mes y franja del día.
 *   excursion_target  la lista de objetivos fijada al empezar, con su
 *                     probabilidad relativa y si se vio (a mano o porque se
 *                     fichó esa especie durante la salida).
 * Solo hay una excursión abierta (`ended_at IS NULL`) a la vez.
 */

export type Excursion = {
  id: string;
  started_at: string;
  ended_at: string | null;
  lat: number | null;
  lng: number | null;
  place: string | null;
  month: number;
  phase: string;
};

export type Target = {
  excursion_id: string;
  species_id: number;
  prob: number;
  seen: number;
  seen_at: string | null;
  sighting_id: string | null;
};

export type ExcursionSummary = {
  excursion: Excursion;
  targets: Target[];
  seen: number;
  total: number;
  ratio: number;
  minutes: number;
  /** Especies fichadas en la salida que no estaban en el cuaderno antes de empezar. */
  newSpecies: number;
  /** Especies fichadas en la salida que no estaban en la lista de objetivos. */
  extras: number;
};

type State = {
  loaded: boolean;
  active: Excursion | null;
  targets: Target[];
  load: () => Promise<void>;
  start: (input: { lat: number | null; lng: number | null; place: string | null; month: number; phase: string; targets: { species_id: number; prob: number }[] }) => Promise<void>;
  toggleSeen: (speciesId: number) => Promise<void>;
  /** Marca como vistos los objetivos que se hayan fichado desde que empezó la salida. */
  syncSightings: () => Promise<void>;
  finish: () => Promise<ExcursionSummary | null>;
  discard: () => Promise<void>;
};

async function readTargets(id: string): Promise<Target[]> {
  return journal().getAllAsync<Target>('SELECT * FROM excursion_target WHERE excursion_id = ? ORDER BY prob DESC', [id]);
}

export const useExcursion = create<State>((set, get) => ({
  loaded: false,
  active: null,
  targets: [],

  async load() {
    const active = await journal().getFirstAsync<Excursion>('SELECT * FROM excursion WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1');
    set({ loaded: true, active: active ?? null, targets: active ? await readTargets(active.id) : [] });
  },

  async start(input) {
    const db = journal();
    // Una sola abierta: si quedó alguna colgada, se cierra antes.
    await db.runAsync('UPDATE excursion SET ended_at = ? WHERE ended_at IS NULL', [new Date().toISOString()]);
    const ex: Excursion = {
      id: Crypto.randomUUID(),
      started_at: new Date().toISOString(),
      ended_at: null,
      lat: input.lat,
      lng: input.lng,
      place: input.place,
      month: input.month,
      phase: input.phase,
    };
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO excursion (id, started_at, ended_at, lat, lng, place, month, phase) VALUES (?,?,?,?,?,?,?,?)', [
        ex.id,
        ex.started_at,
        null,
        ex.lat,
        ex.lng,
        ex.place,
        ex.month,
        ex.phase,
      ]);
      for (const t of input.targets) {
        await tx.runAsync('INSERT OR IGNORE INTO excursion_target (excursion_id, species_id, prob) VALUES (?,?,?)', [ex.id, t.species_id, t.prob]);
      }
    });
    set({ active: ex, targets: await readTargets(ex.id), loaded: true });
  },

  async toggleSeen(speciesId) {
    const { active, targets } = get();
    if (!active) return;
    const cur = targets.find((t) => t.species_id === speciesId);
    if (!cur) return;
    const seen = cur.seen ? 0 : 1;
    const at = seen ? new Date().toISOString() : null;
    await journal().runAsync('UPDATE excursion_target SET seen = ?, seen_at = ?, sighting_id = NULL WHERE excursion_id = ? AND species_id = ?', [
      seen,
      at,
      active.id,
      speciesId,
    ]);
    set({ targets: targets.map((t) => (t.species_id === speciesId ? { ...t, seen, seen_at: at, sighting_id: null } : t)) });
  },

  async syncSightings() {
    const { active, targets } = get();
    if (!active) return;
    const rows = await journal().getAllAsync<{ id: string; species_id: number; created_at: string }>(
      'SELECT id, species_id, created_at FROM sighting WHERE created_at >= ? AND species_id IS NOT NULL ORDER BY created_at',
      [active.started_at],
    );
    const first = new Map<number, { id: string; created_at: string }>();
    for (const r of rows) if (!first.has(r.species_id)) first.set(r.species_id, r);
    let changed = false;
    const next = targets.map((t) => {
      const hit = first.get(t.species_id);
      if (!t.seen && hit) {
        changed = true;
        return { ...t, seen: 1, seen_at: hit.created_at, sighting_id: hit.id };
      }
      return t;
    });
    if (!changed) return;
    for (const t of next) {
      const old = targets.find((o) => o.species_id === t.species_id);
      if (old && !old.seen && t.seen) {
        await journal().runAsync('UPDATE excursion_target SET seen = 1, seen_at = ?, sighting_id = ? WHERE excursion_id = ? AND species_id = ?', [
          t.seen_at,
          t.sighting_id,
          active.id,
          t.species_id,
        ]);
      }
    }
    set({ targets: next });
  },

  async finish() {
    const { active } = get();
    if (!active) return null;
    await get().syncSightings();
    const ended = new Date().toISOString();
    await journal().runAsync('UPDATE excursion SET ended_at = ? WHERE id = ?', [ended, active.id]);
    const summary = await excursionSummary(active.id);
    set({ active: null, targets: [] });
    return summary;
  },

  async discard() {
    const { active } = get();
    if (!active) return;
    await journal().runAsync('DELETE FROM excursion WHERE id = ?', [active.id]);
    set({ active: null, targets: [] });
  },
}));

export async function excursionSummary(id: string): Promise<ExcursionSummary | null> {
  const db = journal();
  const ex = await db.getFirstAsync<Excursion>('SELECT * FROM excursion WHERE id = ?', [id]);
  if (!ex) return null;
  const targets = await readTargets(id);
  const end = ex.ended_at ?? new Date().toISOString();
  const fresh = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT s.species_id) AS n FROM sighting s
     WHERE s.created_at >= ? AND s.created_at <= ? AND s.species_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sighting o WHERE o.species_id = s.species_id AND o.created_at < ?)`,
    [ex.started_at, end, ex.started_at],
  );
  const during = await db.getAllAsync<{ species_id: number }>(
    'SELECT DISTINCT species_id FROM sighting WHERE created_at >= ? AND created_at <= ? AND species_id IS NOT NULL',
    [ex.started_at, end],
  );
  const inList = new Set(targets.map((t) => t.species_id));
  const s = summarize(
    targets.map((t) => ({ species_id: t.species_id, seen: !!t.seen })),
    fresh?.n ?? 0,
    ex.started_at,
    end,
  );
  return {
    excursion: ex,
    targets,
    seen: s.seen,
    total: s.total,
    ratio: s.ratio,
    minutes: s.minutes,
    newSpecies: s.newSpecies,
    extras: during.filter((d) => !inList.has(d.species_id)).length,
  };
}
