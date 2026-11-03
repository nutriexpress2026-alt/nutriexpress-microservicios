import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Las pruebas usan su propia base de MongoDB, que se vacía al empezar.
    env: { MONGO_URL: 'mongodb://127.0.0.1:27018/reportes_test' },
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
