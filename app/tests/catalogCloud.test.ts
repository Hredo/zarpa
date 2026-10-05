import { isNewerCatalog, parseManifest, pickCatalog, storageUrl, type CatalogInfo, type CatalogManifest } from '@/db/catalogCloud';

const manifest: CatalogManifest = {
  version: 'abc123def456',
  schema: 3,
  built_at: '2026-10-06T10:00:00+00:00',
  species: 266400,
  breeds: 8417,
  size: 165_000_000,
  md5: '0123456789abcdef0123456789abcdef',
  files: {
    gz: { path: 'catalog/v/abc123def456/catalogo.db.gz', size: 70_000_000 },
    raw: { path: 'catalog/v/abc123def456/catalogo.db', size: 165_000_000 },
  },
};

const bundled: CatalogInfo = { version: '522abfd9a0d5', schema: 3, built_at: '2026-10-05T12:32:49+00:00', species: 266365, source: 'app' };

describe('manifiesto del catálogo en la nube', () => {
  it('acepta un manifiesto completo', () => {
    expect(parseManifest(manifest)).toEqual(manifest);
  });

  it('rechaza manifiestos incompletos o con rutas fuera de catalog/', () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest({ ...manifest, md5: 'x' })).toBeNull();
    expect(parseManifest({ ...manifest, version: '../../etc' })).toBeNull();
    expect(parseManifest({ ...manifest, files: { ...manifest.files, gz: { path: 'users/ana/x', size: 1 } } })).toBeNull();
    expect(parseManifest({ ...manifest, size: 0 })).toBeNull();
  });

  it('solo ofrece catálogos más nuevos y del mismo esquema', () => {
    expect(isNewerCatalog(manifest, bundled, 3)).toBe(true);
    expect(isNewerCatalog(manifest, bundled, 4)).toBe(false);
    expect(isNewerCatalog({ ...manifest, built_at: '2026-10-01T00:00:00+00:00' }, bundled, 3)).toBe(false);
    expect(isNewerCatalog({ ...manifest, version: bundled.version }, bundled, 3)).toBe(false);
  });

  it('abre el bajado solo si es más nuevo que el de la app y de su esquema', () => {
    const dl = { ...bundled, version: 'abc123def456', built_at: manifest.built_at, source: 'nube' as const, file: 'catalogo-abc123def456.db' };
    expect(pickCatalog(bundled, dl, 3)).toBe(dl);
    expect(pickCatalog(bundled, { ...dl, schema: 2 }, 3)).toBeNull();
    // Una versión nueva de la app trae un catálogo más reciente que el bajado.
    expect(pickCatalog({ ...bundled, built_at: '2026-11-01T00:00:00+00:00' }, dl, 3)).toBeNull();
    expect(pickCatalog(bundled, null, 3)).toBeNull();
  });

  it('construye la URL pública de Storage con la ruta codificada', () => {
    expect(storageUrl('zarpa-47a67.firebasestorage.app', 'catalog/manifest.json')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/zarpa-47a67.firebasestorage.app/o/catalog%2Fmanifest.json?alt=media',
    );
  });
});
