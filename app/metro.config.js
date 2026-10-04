// Configuración de Metro.
//
// El catálogo viaja dentro de la app como base SQLite (`assets/db/*.db`) y el
// modelo de especies como `.pte` (ExecuTorch) con su índice `.bin`. Metro solo
// empaqueta como recurso las extensiones que conoce: sin añadirlas, el
// `require` de esos ficheros falla al empaquetar.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('db', 'pte', 'bin');

module.exports = config;
