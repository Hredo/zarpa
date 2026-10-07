const fs = require('node:fs');
const path = require('node:path');

// Pruebas con el preset de Expo. Las de consultas abren el catálogo real que
// genera tools/ (tools/out/indice.db, ver tests/catalogIndex.ts) con better-sqlite3.
// El catálogo no va en git (~200 MB): sin él (un clon nuevo, la CI) esas pruebas
// se saltan con un aviso y el resto corre igual.
const OUT = path.join(__dirname, '..', 'tools', 'out');
const hasCatalog = ['indice.db', 'catalogo.db'].every((f) => fs.existsSync(path.join(OUT, f)));
const CATALOG_TESTS = ['breeds', 'catalogRemote', 'missions', 'query', 'quiz'];
if (!hasCatalog) {
  console.warn(
    `Sin tools/out/indice.db y catalogo.db: se saltan las pruebas que consultan el catálogo (${CATALOG_TESTS.join(', ')}). ` +
      'Genera el catálogo con tools/ para correrlas (ver README).',
  );
}

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', ...(hasCatalog ? [] : CATALOG_TESTS.map((n) => `/tests/${n}\\.test\\.ts$`))],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  restoreMocks: true,
};
