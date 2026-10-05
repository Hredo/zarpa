import { buildAlbum, compareAlbums, diffAlbum, entryHash, fmtMonth, type AlbumSighting } from '@/social/albumLogic';
import { fmtCode } from '@/social/flows';

const s = (id: string, species_id: number | null, created_at: string, sticker: string | null = null): AlbumSighting => ({
  id,
  species_id,
  created_at,
  sticker,
  photo: `file:///${id}.jpg`,
});

describe('álbum compartido', () => {
  const rows = [
    s('a', 1, '2026-03-02T10:00:00Z', 'file:///a.png'),
    s('b', 1, '2026-09-20T10:00:00Z', 'file:///b.png'),
    s('c', 1, '2026-10-01T10:00:00Z', 'file:///c.png'),
    s('d', 2, '2026-05-05T10:00:00Z', 'file:///d-recorte.jpg'),
    s('e', null, '2026-05-05T10:00:00Z'),
  ];

  it('una ficha por especie, con recuento y meses, sin lugares', () => {
    const album = buildAlbum(rows, new Set(['a', 'b', 'd']));
    expect(album).toEqual([
      { species_id: 1, count: 3, first: '2026-03', last: '2026-10', sticker: 'b', sticker_ext: 'png' },
      { species_id: 2, count: 1, first: '2026-05', last: '2026-05', sticker: 'd', sticker_ext: 'jpg' },
    ]);
  });

  it('solo enseña pegatinas que ya están en la nube y que no son la foto', () => {
    expect(buildAlbum(rows, new Set())[0].sticker).toBeNull();
    const same = [{ ...s('x', 3, '2026-01-01T00:00:00Z'), sticker: 'file:///x.jpg' }];
    expect(buildAlbum(same, new Set(['x']))[0].sticker).toBeNull();
  });

  it('escribe lo nuevo o cambiado y retira lo que ya no está', () => {
    const album = buildAlbum(rows, new Set(['a']));
    const published = new Map<number, string>([
      [1, entryHash(album[0])],
      [9, 'viejo'],
    ]);
    const { upsert, remove } = diffAlbum(album, published);
    expect(upsert.map((e) => e.species_id)).toEqual([2]);
    expect(remove).toEqual([9]);
  });

  it('compara álbumes: en común y lo que te falta', () => {
    expect(compareAlbums(new Set([1, 2, 3]), [2, 3, 4, 5])).toEqual({ common: 2, missing: [4, 5] });
  });

  it('formatos', () => {
    expect(fmtMonth('2026-04')).toBe('abril de 2026');
    expect(fmtCode('ABCDEFGH')).toBe('ABCD EFGH');
  });
});
