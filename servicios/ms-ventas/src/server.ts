import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { cerrarEventos, conectarEventos } from './config/eventos.js';
import { usarAlmacenDeVigencias } from './middlewares/sesiones-vigentes.js';
import { almacenDeVigencias } from './models/sesion.model.js';
import { registroDeEventos } from './models/evento.model.js';
import { registrarSuscripciones } from './suscripciones.js';

// HU-05: las vigencias anotadas antes de un reinicio. Después, los eventos que
// consume (suscripciones.ts) y los que publica (VentaRegistrada). Si RabbitMQ no
// responde, el servicio arranca igual y se reconecta solo.
void usarAlmacenDeVigencias(almacenDeVigencias);
registrarSuscripciones();
await conectarEventos({ servicio: 'ms-ventas', registro: registroDeEventos });

const servidor = app.listen(env.port, () => {
  console.log(`ms-ventas escuchando en el puerto ${env.port}`);
});

function apagar() {
  servidor.close(async () => {
    await cerrarEventos();
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
