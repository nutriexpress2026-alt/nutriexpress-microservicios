/**
 * Datos iniciales de ms-inventario: unidades de medida, dos almacenes e insumos
 * de demostración con existencias. Idempotente. Los productos no se cargan
 * aquí: llegan como réplica desde ms-catalogo, y su stock entra con notas de
 * ingreso (HU-14).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pathToFileURL } from 'node:url';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const ALMACENES = [
  { nombre: 'Almacen Seco',       tipo_conservacion: 'Seco',        ubicacion_fisica: 'Planta baja - deposito' },
  { nombre: 'Camara Refrigerada', tipo_conservacion: 'Refrigerado', ubicacion_fisica: 'Planta baja - cocina' },
];

const REFRIGERADO = 'Camara Refrigerada';
const SECO = 'Almacen Seco';

const UNIDADES = [
  { nombre: 'Kilogramo', abreviatura: 'kg' },
  { nombre: 'Litro', abreviatura: 'L' },
  { nombre: 'Unidad', abreviatura: 'u' },
];

const INSUMOS = [
  { nombre: 'Pechuga de pollo',      unidad: 'Kilogramo', costo: 32.0, minimo: 5, almacen: REFRIGERADO, stock: 20, perecedero: true },
  { nombre: 'Lechuga romana',        unidad: 'Kilogramo', costo: 12.0, minimo: 3, almacen: REFRIGERADO, stock: 10, perecedero: true },
  { nombre: 'Tomate',                unidad: 'Kilogramo', costo: 8.5,  minimo: 4, almacen: REFRIGERADO, stock: 15, perecedero: true },
  { nombre: 'Limon',                 unidad: 'Kilogramo', costo: 9.0,  minimo: 3, almacen: REFRIGERADO, stock: 12, perecedero: true },
  { nombre: 'Yogur griego natural',  unidad: 'Litro',     costo: 22.0, minimo: 4, almacen: REFRIGERADO, stock: 10, perecedero: true },
  { nombre: 'Quinua real',           unidad: 'Kilogramo', costo: 28.0, minimo: 5, almacen: SECO,        stock: 25 },
  { nombre: 'Aceite de oliva',       unidad: 'Litro',     costo: 45.0, minimo: 2, almacen: SECO,        stock: 8 },
  { nombre: 'Avena en hojuelas',     unidad: 'Kilogramo', costo: 14.0, minimo: 5, almacen: SECO,        stock: 30 },
  { nombre: 'Almendras',             unidad: 'Kilogramo', costo: 65.0, minimo: 2, almacen: SECO,        stock: 6 },
  { nombre: 'Harina integral',       unidad: 'Kilogramo', costo: 11.0, minimo: 6, almacen: SECO,        stock: 40 },
];

export async function main() {
  for (const almacen of ALMACENES) {
    await prisma.almacen.upsert({ where: { nombre: almacen.nombre }, update: {}, create: almacen });
  }

  for (const unidad of UNIDADES) {
    await prisma.unidad_medida.upsert({
      where: { nombre: unidad.nombre },
      update: {},
      create: unidad,
    });
  }
  const idUnidad = new Map(
    (await prisma.unidad_medida.findMany()).map((u) => [u.nombre, u.id_unidad]),
  );
  const idAlmacen = new Map(
    (await prisma.almacen.findMany()).map((a) => [a.nombre, a.id_almacen]),
  );

  for (const item of INSUMOS) {
    const existente = await prisma.ingrediente.findFirst({ where: { nombre: item.nombre } });
    const insumo =
      existente ??
      (await prisma.ingrediente.create({
        data: {
          nombre: item.nombre,
          id_unidad: idUnidad.get(item.unidad)!,
          costo_unitario: item.costo,
          stock_minimo: item.minimo,
          tipo_conservacion: item.almacen === REFRIGERADO ? 'Refrigerado' : 'Seco',
          // Los frescos exigen lote y vencimiento en cada ingreso (hallazgo A6).
          controla_vencimiento: 'perecedero' in item && item.perecedero === true,
        },
      }));

    await prisma.ingrediente_almacen.upsert({
      where: {
        id_ingrediente_id_almacen: {
          id_ingrediente: insumo.id_ingrediente,
          id_almacen: idAlmacen.get(item.almacen)!,
        },
      },
      update: {},
      create: {
        id_ingrediente: insumo.id_ingrediente,
        id_almacen: idAlmacen.get(item.almacen)!,
        stock_actual: item.stock,
      },
    });
  }
  console.log(`ms-inventario: ${ALMACENES.length} almacenes, ${INSUMOS.length} insumos`);
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
