import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Las pruebas usan su propia base de MongoDB, que se vacía al empezar, y el
    // RabbitMQ de docker compose en un virtual host propio (con colas propias
    // que se borran al terminar): lo que publican no llega a los servicios.
    env: {
      MONGO_URL: 'mongodb://127.0.0.1:27018/reportes_test',
      RABBITMQ_URL: 'amqp://nutriexpress:nutriexpress@127.0.0.1:5673/pruebas',
      // Sprint 6 · Identidad, catálogo, ventas y pedidos los imita un servidor local (tests/servicios-falsos.ts).
      IDENTIDAD_URL: 'http://127.0.0.1:4996/identidad',
      CATALOGO_URL: 'http://127.0.0.1:4996/catalogo',
      INVENTARIO_URL: 'http://127.0.0.1:4996/inventario',
      VENTAS_URL: 'http://127.0.0.1:4996/ventas',
      PEDIDOS_URL: 'http://127.0.0.1:4996/pedidos',
    },
    globalSetup: ['./tests/rabbit-de-pruebas.ts'],
    // En serie: comparten la base de pruebas y una vacía lo que la otra escribe.
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
