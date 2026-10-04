// Reglas de Expo (incluye React, hooks y TypeScript). Se ignoran los generados.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*', 'modules/*/android/build/*'],
  },
]);
