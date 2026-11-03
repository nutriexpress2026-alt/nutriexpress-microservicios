/**
 * Arranque de la base de ms-inventario: si su base está vacía crea las
 * tablas desde prisma/esquema.sql, y después carga los datos iniciales.
 * Se ejecuta en cada arranque del contenedor; las dos partes son idempotentes.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { main as sembrar, prismaSemilla } from './seed.js';

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function esperarBase(intentos = 30) {
  for (let i = 1; ; i++) {
    try {
      await cliente.connect();
      return;
    } catch (e) {
      if (i >= intentos) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

await esperarBase();
const { rows } = await cliente.query(`select to_regclass('public.almacen') is not null as existe`);
if (!rows[0].existe) {
  const sql = readFileSync(fileURLToPath(new URL('./esquema.sql', import.meta.url)), 'utf8');
  await cliente.query(sql);
  console.log('ms-inventario: tablas creadas');
}
await cliente.end();

await sembrar();
await prismaSemilla.$disconnect();
