import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite transforma cada fichero con el tsconfig más cercano: para flows.ts sería
  // el de la app, que hereda de `expo/tsconfig.base` y solo existe con
  // app/node_modules (en la CI no está). Todos usan el de aquí.
  tsconfig: './tsconfig.json',
  resolve: {
    // Las pruebas importan los flujos de la app (app/src/social/flows.ts): su
    // `firebase/firestore` tiene que ser la misma copia que usa el entorno de
    // pruebas, o Firestore no reconoce sus propias referencias.
    dedupe: ['firebase', '@firebase/firestore', '@firebase/app'],
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    // Las pruebas comparten emuladores: un fichero a la vez.
    fileParallelism: false,
  },
});
