import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from './stock.model.js';
import { contieneTodas, limite } from './busqueda-texto.js';

/**
 * Réplica local de los productos de ms-catalogo (RNF-ARQ-02).
 *
 * El dueño del producto es ms-catalogo. Inventario guarda solo lo que necesita
 * para sus notas y existencias —id, nombre, conservación y si está activo— en
 * la tabla `producto` de su propia base. Así sus consultas y claves foráneas
 * (producto_almacen, detalle_ingreso_producto…) funcionan sin leer la base
 * ajena. La réplica la actualiza ms-catalogo por REST interno en cada cambio y,
 * al arrancar, este servicio pide la lista completa (Sprint 3: por eventos).
 */

/** Productos cuyo nombre contiene todas las palabras buscadas, sin tildes ni mayúsculas. */
export async function idsQueCoinciden(termino: string, tope?: number): Promise<number[]> {
  const filas = await prisma.$queryRaw<{ id_producto: number }[]>`
    SELECT p.id_producto FROM producto p
    WHERE ${contieneTodas(Prisma.sql`p.nombre`, termino)}
    ORDER BY p.nombre
    ${limite(tope)}`;
  return filas.map((f) => f.id_producto);
}

/** Condición de búsqueda por texto, lista para un `where`. */
export const porTexto = async (termino?: string) =>
  termino ? { id_producto: { in: await idsQueCoinciden(termino) } } : {};

/** Productos existentes entre los indicados; `soloActivos` filtra las bajas lógicas. */
export const existentes = (ids: number[], tx: ClientePrisma, soloActivos: boolean) =>
  tx.producto.findMany({
    where: { id_producto: { in: ids }, ...(soloActivos ? { activo: true } : {}) },
    select: { id_producto: true, nombre: true, tipo_conservacion: true },
  });

/**
 * Costo unitario promedio de cada producto, calculado con sus notas de ingreso
 * (lo que costó cada unidad que entró). Un producto que nunca ingresó no figura.
 */
export async function costosPromedio(
  ids: number[],
  tx: ClientePrisma = prisma,
): Promise<Map<number, number>> {
  const lineas = await tx.detalle_ingreso_producto.findMany({
    where: { id_producto: { in: ids } },
    select: { id_producto: true, cantidad: true, costo_unitario: true },
  });

  const acumulado = new Map<number, { unidades: number; total: number }>();
  for (const l of lineas) {
    const a = acumulado.get(l.id_producto) ?? { unidades: 0, total: 0 };
    a.unidades += l.cantidad;
    a.total += l.cantidad * Number(l.costo_unitario);
    acumulado.set(l.id_producto, a);
  }

  return new Map(
    [...acumulado]
      .filter(([, a]) => a.unidades > 0)
      .map(([id, a]) => [id, Math.round((a.total / a.unidades) * 100) / 100]),
  );
}

/* ------------------------------------------------------------------ réplica */

export interface DatosReplica {
  id: number;
  nombre: string;
  tipoConservacion: string;
  activo: boolean;
}

export const guardarReplica = (p: DatosReplica) =>
  prisma.producto.upsert({
    where: { id_producto: p.id },
    update: { nombre: p.nombre, tipo_conservacion: p.tipoConservacion, activo: p.activo },
    create: { id_producto: p.id, nombre: p.nombre, tipo_conservacion: p.tipoConservacion, activo: p.activo },
  });

/** Cuántas existencias y movimientos tiene: con alguno, el producto no se puede eliminar. */
export async function contarUsos(id: number): Promise<number> {
  const [existencias, ingresos, egresos] = await Promise.all([
    prisma.producto_almacen.count({ where: { id_producto: id } }),
    prisma.detalle_ingreso_producto.count({ where: { id_producto: id } }),
    prisma.detalle_egreso_producto.count({ where: { id_producto: id } }),
  ]);
  return existencias + ingresos + egresos;
}

export const quitarReplica = (id: number) => prisma.producto.deleteMany({ where: { id_producto: id } });

/** Existencias por almacén de los productos pedidos (para ms-catalogo). */
export const existenciasDe = (ids: number[]) =>
  prisma.producto_almacen.findMany({
    where: { id_producto: { in: ids } },
    select: { id_producto: true, stock_actual: true, almacen: { select: { id_almacen: true, nombre: true } } },
    orderBy: { id_almacen: 'asc' },
  });
