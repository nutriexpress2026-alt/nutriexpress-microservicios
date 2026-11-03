import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { sincronizarProductos } from './clientes/catalogo.js';

const servidor = app.listen(env.port, () => {
  console.log(`ms-inventario escuchando en el puerto ${env.port}`);
  void sincronizarProductos();
});

function apagar() {
  servidor.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
