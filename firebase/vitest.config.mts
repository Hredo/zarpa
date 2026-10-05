import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    // Las pruebas comparten emuladores: un fichero a la vez.
    fileParallelism: false,
  },
});
