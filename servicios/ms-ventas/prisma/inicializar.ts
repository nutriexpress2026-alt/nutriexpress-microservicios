/**
 * Arranque de la base de ms-ventas: si su base está vacía crea las
 * tablas desde prisma/esquema.sql.
 * Se ejecuta en cada arranque del contenedor; las dos partes son idempotentes.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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
const sql = readFileSync(fileURLToPath(new URL('./esquema.sql', import.meta.url)), 'utf8');
const { rows } = await cliente.query(`select to_regclass('public.venta') is not null as existe`);
if (!rows[0].existe) {
  await cliente.query(sql);
  console.log('ms-ventas: tablas creadas');
} else {
  // Base que ya existía: solo lo agregado después de la primera versión, que es
  // idempotente (IF NOT EXISTS). Así las tablas nuevas llegan sin borrar datos.
  const marca = sql.indexOf('-- >>> Posteriores a la primera versión');
  if (marca >= 0) await cliente.query(sql.slice(marca));
}
await cliente.end();
// Sin datos iniciales: los pedidos y las direcciones los crean los clientes.
