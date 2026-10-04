// Pruebas con el preset de Expo. Las de consultas abren el catálogo real que
// genera tools/ (assets/db/catalogo.db) con better-sqlite3, que trae FTS5.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  restoreMocks: true,
};
