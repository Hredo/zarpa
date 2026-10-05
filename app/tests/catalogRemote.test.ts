import fs from 'node:fs';
import path from 'node:path';

import {
  CATALOG_SCHEMA,
  catalogUrl,
  countryPath,
  isNewerCatalog,
  parseCountry,
  parseManifest,
  parseShard,
  shardOf,
  shardPath,
  type CatalogManifest,
} from '@/db/catalogRemote';
import { expandUrl } from '@/lib/urls';

import { openIndex } from './catalogIndex';

const manifest: CatalogManifest = {
  version: 'abc123def456',
  schema: CATALOG_SCHEMA,
  built_at: '2026-10-06T10:00:00+00:00',
  species: 266400,
  breeds: 8417,
  shards: 4096,
  size: 43_000_000,
  md5: '0123456789abcdef0123456789abcdef',
  files: {
    gz: { path: 'c/abc123def456/indice.db.gz', size: 18_000_000 },
    raw: { path: 'c/abc123def456/indice.db', size: 43_000_000 },
  },
};

describe('manifiesto del catálogo en Hosting', () => {
  it('acepta un manifiesto completo', () => {
    expect(parseManifest(manifest)).toEqual(manifest);
  });

  it('rechaza manifiestos incompletos o con rutas fuera de su versión', () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest({ ...manifest, md5: 'x' })).toBeNull();
    expect(parseManifest({ ...manifest, version: '../../etc' })).toBeNull();
    expect(parseManifest({ ...manifest, shards: 0 })).toBeNull();
    expect(parseManifest({ ...manifest, size: 0 })).toBeNull();
    expect(parseManifest({ ...manifest, files: { ...manifest.files, gz: { path: 'c/otra/indice.db.gz', size: 1 } } })).toBeNull();
    expect(parseManifest({ ...manifest, files: { ...manifest.files, raw: { path: 'c/abc123def456/../x', size: 1 } } })).toBeNull();
  });

  it('solo ofrece índices de su esquema, distintos y no más viejos', () => {
    const current = { version: '522abfd9a0d5', built_at: '2026-10-05T12:32:49+00:00' };
    expect(isNewerCatalog(manifest, current, CATALOG_SCHEMA)).toBe(true);
    expect(isNewerCatalog(manifest, current, CATALOG_SCHEMA + 1)).toBe(false);
    expect(isNewerCatalog({ ...manifest, built_at: '2026-10-01T00:00:00+00:00' }, current, CATALOG_SCHEMA)).toBe(false);
    expect(isNewerCatalog({ ...manifest, version: current.version }, current, CATALOG_SCHEMA)).toBe(false);
  });

  it('rutas de fichas y países', () => {
    expect(catalogUrl('c/manifest.json')).toMatch(/^https:\/\/[^/]+\/c\/manifest\.json$/);
    expect(shardOf(42069, 4096)).toBe(42069 % 4096);
    expect(shardPath('abc123def456', 7)).toBe('c/abc123def456/d/7.json');
    expect(countryPath('abc123def456', 'es')).toBe('c/abc123def456/cc/ES.json');
  });

  it('valida trozos y listas de país de su versión', () => {
    expect(parseShard({ v: 'abc123def456', n: 7, sp: { '7': { d: { summary: 'x' } } } }, 'abc123def456', 7)).toEqual({ '7': { d: { summary: 'x' } } });
    expect(parseShard({ v: 'otra', n: 7, sp: {} }, 'abc123def456', 7)).toBeNull();
    expect(parseShard({ v: 'abc123def456', n: 8, sp: {} }, 'abc123def456', 7)).toBeNull();
    expect(parseCountry({ v: 'abc123def456', cc: 'ES', s: [[1, 30], [2, 'x'], [3, 4]] }, 'abc123def456', 'es')).toEqual([
      [1, 30],
      [3, 4],
    ]);
    expect(parseCountry({ v: 'abc123def456', cc: 'PT', s: [] }, 'abc123def456', 'ES')).toBeNull();
  });
});

describe('URLs compactas de fotos', () => {
  it('reconstruye la miniatura de Commons y deja el resto como estaba', () => {
    expect(expandUrl('t:6/64/Lynx_pardinus.jpg')).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Lynx_pardinus.jpg/960px-Lynx_pardinus.jpg');
    expect(expandUrl('c:2/27/Aramus_guarauna.jpg')).toBe('https://upload.wikimedia.org/wikipedia/commons/2/27/Aramus_guarauna.jpg');
    expect(expandUrl('i:129040627/medium.jpg')).toBe('https://inaturalist-open-data.s3.amazonaws.com/photos/129040627/medium.jpg');
    expect(expandUrl(null)).toBeNull();
  });
});

/*
 * Lo publicado por tools/ (tools/out/hosting) casa con lo que espera la app:
 * esquema, versión y que cada especie está en el trozo que le toca.
 */
describe('catálogo publicado', () => {
  const out = path.join(__dirname, '..', '..', 'tools', 'out', 'hosting', 'c');
  const db = openIndex();
  const meta = Object.fromEntries((db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const published = parseManifest(JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')));

  it('el manifiesto y el índice son de esta app y de la misma versión', () => {
    expect(published).not.toBeNull();
    expect(published!.schema).toBe(CATALOG_SCHEMA);
    expect(Number(meta.schema)).toBe(CATALOG_SCHEMA);
    expect(meta.version).toBe(published!.version);
    expect(Number(meta.shards)).toBe(published!.shards);
  });

  it('cada especie está en su trozo, con su galería y sus países', () => {
    const lynx = db.prepare("SELECT id FROM species WHERE sci = 'Lynx pardinus'").get() as { id: number };
    const n = shardOf(lynx.id, published!.shards);
    const sp = parseShard(JSON.parse(fs.readFileSync(path.join(out, published!.version, 'd', `${n}.json`), 'utf8')), published!.version, n);
    const entry = sp?.[String(lynx.id)];
    expect(entry?.i?.length).toBeGreaterThan(0);
    expect(entry?.c?.map((c) => c[0])).toContain('ES');
    expect(entry?.d?.summary).toBeTruthy();
  });

  it('el resumen de las especies del quiz viaja en el índice', () => {
    const row = db.prepare('SELECT COUNT(*) AS n FROM detail WHERE summary IS NOT NULL').get() as { n: number };
    expect(row.n).toBeGreaterThan(1000);
  });
});
