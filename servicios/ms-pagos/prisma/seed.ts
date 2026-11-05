/**
 * Datos iniciales de ms-pagos: el modo de cobro con que nace el sistema
 * (HU-27). Simulado, para que nadie cobre dinero real sin decidirlo. Idempotente:
 * si el administrador ya lo cambió, no lo toca.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pathToFileURL } from 'node:url';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

export async function main() {
  await prisma.configuracion.upsert({
    where: { clave: 'MODO_COBRO' },
    create: { clave: 'MODO_COBRO', valor: 'Simulado' },
    update: {},
  });
  console.log('ms-pagos: modo de cobro inicial');
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export { prisma as prismaSemilla };
