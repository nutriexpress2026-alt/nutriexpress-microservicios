/**
 * Datos iniciales de ms-catalogo: categorías y productos de demostración con su
 * información nutricional. Idempotente. Las existencias no van aquí: son de
 * ms-inventario y entran con notas de ingreso (HU-14).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pathToFileURL } from 'node:url';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const CATALOGO = [
  { nombre: 'Ensalada Cesar con pollo', categoria: 'Ensaladas', precio: 35,
    descripcion: 'Lechuga romana, pollo a la plancha, crutones integrales y aderezo ligero.',
    conservacion: 'Refrigerado',
    nutricion: { calorias: 320, proteinas_g: 28, carbohidratos_g: 12, grasas_g: 18, fibra_g: 3.5 } },
  { nombre: 'Ensalada mediterranea', categoria: 'Ensaladas', precio: 32,
    descripcion: 'Tomate, pepino, aceitunas, queso fresco y aceite de oliva.',
    conservacion: 'Refrigerado',
    nutricion: { calorias: 280, proteinas_g: 9, carbohidratos_g: 20, grasas_g: 17, fibra_g: 5.2 } },
  { nombre: 'Bowl de quinua y verduras', categoria: 'Platos principales', precio: 42,
    descripcion: 'Quinua real, verduras salteadas, palta y semillas de girasol.',
    conservacion: 'Refrigerado',
    nutricion: { calorias: 450, proteinas_g: 16, carbohidratos_g: 62, grasas_g: 14, fibra_g: 8.1 } },
  { nombre: 'Pechuga a la plancha con pure', categoria: 'Platos principales', precio: 48,
    descripcion: 'Pechuga de pollo, pure de papa nativa y ensalada de estacion.',
    conservacion: 'Refrigerado',
    nutricion: { calorias: 520, proteinas_g: 42, carbohidratos_g: 38, grasas_g: 20, fibra_g: 4 } },
  { nombre: 'Wrap integral de pollo', categoria: 'Platos principales', precio: 38,
    descripcion: 'Tortilla integral, pollo desmenuzado, vegetales frescos y yogur natural.',
    conservacion: 'Refrigerado',
    nutricion: { calorias: 410, proteinas_g: 30, carbohidratos_g: 40, grasas_g: 13, fibra_g: 6 } },
  { nombre: 'Jugo verde detox', categoria: 'Bebidas naturales', precio: 18,
    descripcion: 'Espinaca, manzana verde, apio y jengibre, sin azucar anadida.',
    conservacion: 'Refrigerado',
    nutricion: { calorias: 120, proteinas_g: 2, carbohidratos_g: 26, grasas_g: 0.5, fibra_g: 3.8 } },
  { nombre: 'Limonada con hierbabuena', categoria: 'Bebidas naturales', precio: 15,
    descripcion: 'Limon exprimido, hierbabuena fresca y endulzante natural.',
    conservacion: 'Refrigerado',
    nutricion: { calorias: 90, proteinas_g: 0.4, carbohidratos_g: 23, grasas_g: 0.2, fibra_g: 0.6 } },
  { nombre: 'Mousse de maracuya light', categoria: 'Postres saludables', precio: 16,
    descripcion: 'Postre de maracuya con yogur griego, sin azucar anadida.',
    conservacion: 'Refrigerado',
    nutricion: { calorias: 150, proteinas_g: 5, carbohidratos_g: 18, grasas_g: 6, fibra_g: 1.2 } },
  { nombre: 'Barra de avena y almendras', categoria: 'Postres saludables', precio: 12,
    descripcion: 'Barra horneada de avena, almendras y miel de abeja.',
    conservacion: 'Seco',
    nutricion: { calorias: 210, proteinas_g: 6, carbohidratos_g: 24, grasas_g: 10, fibra_g: 4.4 } },
  { nombre: 'Galletas de avena sin azucar', categoria: 'Postres saludables', precio: 14,
    descripcion: 'Galletas integrales endulzadas con pasas y canela.',
    conservacion: 'Seco',
    nutricion: { calorias: 180, proteinas_g: 4, carbohidratos_g: 26, grasas_g: 7, fibra_g: 3.1 } },
];

export async function main() {
  for (const nombre of new Set(CATALOGO.map((p) => p.categoria))) {
    await prisma.categoria.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
  const idCategoria = new Map((await prisma.categoria.findMany()).map((c) => [c.nombre, c.id_categoria]));

  for (const item of CATALOGO) {
    const existente = await prisma.producto.findFirst({ where: { nombre: item.nombre } });
    const producto =
      existente ??
      (await prisma.producto.create({
        data: {
          nombre: item.nombre,
          descripcion: item.descripcion,
          precio_venta: item.precio,
          tipo_conservacion: item.conservacion,
          id_categoria: idCategoria.get(item.categoria)!,
        },
      }));
    await prisma.valor_nutricional.upsert({
      where: { id_producto: producto.id_producto },
      update: {},
      create: { id_producto: producto.id_producto, ...item.nutricion },
    });
  }
  console.log(`ms-catalogo: ${CATALOGO.length} productos de demostración`);
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
