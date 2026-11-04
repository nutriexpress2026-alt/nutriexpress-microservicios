import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { cerrarEventos, conectarEventos } from './config/eventos.js';
import { redis } from './config/redis.js';

// Solo publica (CodigoRecuperacionGenerado): no necesita registro de eventos procesados.
// Si RabbitMQ no responde, el servicio arranca igual y se reconecta solo.
await conectarEventos({ servicio: 'ms-identidad' });

const servidor = app.listen(env.port, () => {
  console.log(`ms-identidad escuchando en el puerto ${env.port}`);
});

async function apagar(senal: string) {
  console.log(`\n${senal} recibido, cerrando...`);
  servidor.close(async () => {
    await cerrarEventos();
    if (redis?.isOpen) await redis.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void apagar('SIGINT'));
process.on('SIGTERM', () => void apagar('SIGTERM'));
