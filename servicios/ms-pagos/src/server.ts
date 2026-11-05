import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { cerrarEventos, conectarEventos } from './config/eventos.js';
import { usarAlmacenDeVigencias } from './middlewares/sesiones-vigentes.js';
import { almacenDeVigencias } from './models/sesion.model.js';
import { registroDeEventos } from './models/evento.model.js';
import { registrarSuscripciones } from './suscripciones.js';
import { vencerPendientes } from './services/pago.service.js';

// HU-05: las vigencias anotadas antes de un reinicio. Después, los eventos que
// consume (suscripciones.ts) y los que publica (PagoConfirmado, PagoFallido).
// Si RabbitMQ no responde, el servicio arranca igual y se reconecta solo.
void usarAlmacenDeVigencias(almacenDeVigencias);
registrarSuscripciones();
await conectarEventos({ servicio: 'ms-pagos', registro: registroDeEventos });

const servidor = app.listen(env.port, () => {
  console.log(`ms-pagos escuchando en el puerto ${env.port}`);
});

/**
 * HU-26 · «Si vence, el pedido se cancela y el stock se libera.» El barrido corre
 * solo, sin depender de que alguien vuelva a mirar el cobro: el vencido publica
 * PagoFallido y ms-pedidos cancela el pedido.
 */
const barrido = setInterval(() => {
  vencerPendientes().catch((e) => console.error('ms-pagos: barrido de vencimientos', (e as Error).message));
}, env.pago.segundosBarrido * 1000);

function apagar() {
  clearInterval(barrido);
  servidor.close(async () => {
    await cerrarEventos();
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
