// Pruebas con el preset de Expo. Las de consultas abren el catálogo real que
// genera tools/ (tools/out/indice.db, ver tests/catalogIndex.ts) con better-sqlite3.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  restoreMocks: true,
};
