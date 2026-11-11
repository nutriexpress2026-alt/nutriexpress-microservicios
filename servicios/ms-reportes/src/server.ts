import { app } from './app.js';
import { env } from './config/env.js';
import { mongo } from './config/mongo.js';
import { cerrarEventos, conectarEventos } from './config/eventos.js';
import { registroDeEventos } from './models/evento.model.js';
import { registrarSuscripciones } from './suscripciones.js';
import { prepararIndices } from './models/proyeccion.model.js';
import { almacenDeVigencias } from './models/vigencia.model.js';
import { usarAlmacenDeVigencias } from './middlewares/sesiones-vigentes.js';
import { sincronizar } from './services/proyeccion.service.js';
import { enviarPendientes } from './services/aviso.service.js';

// Consume eventos (por ahora, el correo con el código de recuperación). Si
// RabbitMQ no responde, el servicio arranca igual y se reconecta solo.
registrarSuscripciones();
await prepararIndices().catch((e: unknown) => console.error(`ms-reportes: índices (${(e as Error).message})`));
await usarAlmacenDeVigencias(almacenDeVigencias);
await conectarEventos({ servicio: 'ms-reportes', registro: registroDeEventos });
// Sprint 6 · La copia completa de ventas y pedidos (sin esperar: los otros servicios pueden estar arrancando).
void sincronizar();
// HU-32 · La bandeja de salida de los avisos al cliente.
const bandeja = setInterval(() => void enviarPendientes(), env.segundosBandeja * 1000);

const servidor = app.listen(env.port, () => {
  console.log(`ms-reportes escuchando en el puerto ${env.port}`);
});

function apagar() {
  clearInterval(bandeja);
  servidor.close(async () => {
    await cerrarEventos();
    await mongo.close();
    process.exit(0);
  });
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
