// Configuración de Metro.
//
// El modelo de especies viaja dentro de la app como `.pte` (ExecuTorch) con su
// índice `.bin`. Metro solo empaqueta como recurso las extensiones que conoce:
// sin añadirlas, el `require` de esos ficheros falla al empaquetar. (El
// catálogo ya no va dentro: se baja de Firebase Hosting, ver src/db/index.ts.)
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('pte', 'bin');

module.exports = config;
