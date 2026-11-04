import { app } from './app.js';
import { env } from './config/env.js';
import { mongo } from './config/mongo.js';
import { cerrarEventos, conectarEventos } from './config/eventos.js';
import { registroDeEventos } from './models/evento.model.js';
import { registrarSuscripciones } from './suscripciones.js';

// Consume eventos (por ahora, el correo con el código de recuperación). Si
// RabbitMQ no responde, el servicio arranca igual y se reconecta solo.
registrarSuscripciones();
await conectarEventos({ servicio: 'ms-reportes', registro: registroDeEventos });

const servidor = app.listen(env.port, () => {
  console.log(`ms-reportes escuchando en el puerto ${env.port}`);
});

function apagar() {
  servidor.close(async () => {
    await cerrarEventos();
    await mongo.close();
    process.exit(0);
  });
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
