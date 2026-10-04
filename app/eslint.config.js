// Reglas de Expo (incluye React, hooks y TypeScript). Se ignoran los generados.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Expo permite `require()` de las extensiones de recurso de Metro; los modelos
// de IA (.pte, .bin) también lo son en este proyecto (ver metro.config.js).
const expoAssetRequires = expoConfig.flatMap((c) => c.rules?.['@typescript-eslint/no-require-imports']?.[1]?.allow ?? []);

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*', 'modules/*/android/build/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-require-imports': ['warn', { allow: [...expoAssetRequires, '\\.(pte|bin)$'] }],
    },
  },
]);
