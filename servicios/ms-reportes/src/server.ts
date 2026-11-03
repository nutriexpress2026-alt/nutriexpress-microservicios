import { app } from './app.js';
import { env } from './config/env.js';
import { mongo } from './config/mongo.js';

const servidor = app.listen(env.port, () => {
  console.log(`ms-reportes escuchando en el puerto ${env.port}`);
});

function apagar() {
  servidor.close(async () => {
    await mongo.close();
    process.exit(0);
  });
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
