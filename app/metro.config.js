// Configuración de Metro.
//
// El catálogo viaja dentro de la app como base SQLite (`assets/db/*.db`) y Metro
// solo empaqueta como recurso las extensiones que conoce: sin añadir `db`, el
// `require` del catálogo falla al empaquetar.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('db');

module.exports = config;
