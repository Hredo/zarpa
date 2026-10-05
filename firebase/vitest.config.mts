import { defineConfig } from 'vitest/config';

export default defineConfig({
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
