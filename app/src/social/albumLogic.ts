/*
 * Álbum compartido con los amigos, en piezas puras (se prueban sin Firebase).
 *
 * Una ficha por especie del cuaderno: cuántas veces se vio, primer y último
 * mes, y la pegatina más reciente que ya esté en la nube. Nada de lugares,
 * coordenadas, notas ni fotos completas: es lo que validan las reglas.
 */

export type AlbumEntry = {
  species_id: number;
  count: number;
  /** `AAAA-MM` del primer avistamiento. */
  first: string;
  /** `AAAA-MM` del último. */
  last: string;
  /** Id del avistamiento cuya pegatina se enseña (está en Storage), o null. */
  sticker: string | null;
  sticker_ext: 'png' | 'jpg' | null;
};

export type AlbumSighting = {
  id: string;
  species_id: number | null;
  created_at: string;
  sticker: string | null;
  photo: string | null;
};

const month = (iso: string) => iso.slice(0, 7);

/**
 * Agrupa el cuaderno por especie. `stickersInCloud` son los avistamientos cuya
 * pegatina ya subió la sincronización (solo esas se pueden enseñar).
 */
export function buildAlbum(rows: AlbumSighting[], stickersInCloud: ReadonlySet<string>): AlbumEntry[] {
  const by = new Map<number, AlbumSighting[]>();
  for (const r of rows) {
    if (r.species_id == null || !/^\d{4}-\d{2}/.test(r.created_at)) continue;
    const list = by.get(r.species_id) ?? [];
    list.push(r);
    by.set(r.species_id, list);
  }
  const out: AlbumEntry[] = [];
  for (const [species_id, list] of by) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const withSticker = [...list].reverse().find((s) => stickersInCloud.has(s.id) && !!s.sticker && s.sticker !== s.photo);
    out.push({
      species_id,
      count: list.length,
      first: month(list[0].created_at),
      last: month(list[list.length - 1].created_at),
      sticker: withSticker?.id ?? null,
      sticker_ext: withSticker ? (/\.png$/i.test(withSticker.sticker ?? '') ? 'png' : 'jpg') : null,
    });
  }
  return out.sort((a, b) => a.species_id - b.species_id);
}

export function entryHash(e: AlbumEntry): string {
  return `${e.count}|${e.first}|${e.last}|${e.sticker ?? ''}|${e.sticker_ext ?? ''}`;
}

/** Qué fichas hay que escribir y cuáles retirar respecto a lo ya publicado. */
export function diffAlbum(entries: AlbumEntry[], published: ReadonlyMap<number, string>): { upsert: AlbumEntry[]; remove: number[] } {
  const upsert = entries.filter((e) => published.get(e.species_id) !== entryHash(e));
  const present = new Set(entries.map((e) => e.species_id));
  const remove = [...published.keys()].filter((id) => !present.has(id));
  return { upsert, remove };
}

/** Comparación de dos álbumes: lo que tenéis en común y lo que te falta del otro. */
export function compareAlbums(mine: ReadonlySet<number>, theirs: readonly number[]): { common: number; missing: number[] } {
  let common = 0;
  const missing: number[] = [];
  for (const id of theirs) {
    if (mine.has(id)) common++;
    else missing.push(id);
  }
  return { common, missing };
}

/** «abril de 2026» a partir de `2026-04`. */
export function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' });
  return `${name} de ${y}`;
}
