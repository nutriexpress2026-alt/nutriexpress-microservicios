import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { cerrarEventos, conectarEventos, suscribir } from './config/eventos.js';
import { permisosCambiados, usarAlmacenDeVigencias } from './middlewares/sesiones-vigentes.js';
import { almacenDeVigencias } from './models/sesion.model.js';
import { registroDeEventos } from './models/evento.model.js';

// HU-05: trae las vigencias anotadas antes de un reinicio y escucha los cambios
// de permisos. Si RabbitMQ no responde, el servicio arranca igual y se reconecta solo.
void usarAlmacenDeVigencias(almacenDeVigencias);
suscribir('PermisosCambiados', permisosCambiados);
await conectarEventos({ servicio: 'ms-catalogo', registro: registroDeEventos });

const servidor = app.listen(env.port, () => {
  console.log(`ms-catalogo escuchando en el puerto ${env.port}`);
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
