import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from './stock.model.js';

/** Capa Model — reservas de stock (HU-17). */

const INCLUIR = {
  detalle_reserva_insumo: {
    include: { ingrediente: { select: { nombre: true, costo_unitario: true, unidad_medida: { select: { abreviatura: true } } } } },
    orderBy: { id_ingrediente: 'asc' as const },
  },
  detalle_reserva_producto: {
    include: { producto: { select: { nombre: true } } },
    orderBy: { id_producto: 'asc' as const },
  },
  almacen: { select: { id_almacen: true, nombre: true } },
};

export type ReservaCompleta = NonNullable<Awaited<ReturnType<typeof buscar>>>;

export const buscar = (id: string, tx: ClientePrisma = prisma) =>
  tx.reserva.findUnique({ where: { id_reserva: id }, include: INCLUIR });

/**
 * Bloquea las filas de los ítems hasta el fin de la transacción. Dos reservas
 * (o una reserva y un egreso) sobre el mismo insumo se atienden de a una: sin
 * esto, las dos verían el mismo disponible y se repartirían más de lo que hay.
 * El orden por id evita que dos transacciones se esperen mutuamente.
 */
export async function bloquear(tx: ClientePrisma, idsInsumo: number[], idsProducto: number[]): Promise<void> {
  if (idsInsumo.length > 0) {
    await tx.$queryRaw`SELECT id_ingrediente FROM ingrediente
      WHERE id_ingrediente IN (${Prisma.join(idsInsumo)}) ORDER BY id_ingrediente FOR UPDATE`;
  }
  if (idsProducto.length > 0) {
    await tx.$queryRaw`SELECT id_producto FROM producto
      WHERE id_producto IN (${Prisma.join(idsProducto)}) ORDER BY id_producto FOR UPDATE`;
  }
}

/** Stock total (todos los almacenes) y lo reservado en reservas activas, por insumo. */
export async function saldosDeInsumos(tx: ClientePrisma, ids: number[]) {
  const [insumos, stock, reservado] = await Promise.all([
    tx.ingrediente.findMany({
      where: { id_ingrediente: { in: ids } },
      select: { id_ingrediente: true, nombre: true, activo: true, costo_unitario: true, unidad_medida: { select: { abreviatura: true } } },
    }),
    tx.ingrediente_almacen.groupBy({ by: ['id_ingrediente'], where: { id_ingrediente: { in: ids } }, _sum: { stock_actual: true } }),
    tx.detalle_reserva_insumo.groupBy({
      by: ['id_ingrediente'],
      where: { id_ingrediente: { in: ids }, reserva: { estado: 'Activa' } },
      _sum: { cantidad: true },
    }),
  ]);
  const stockDe = new Map(stock.map((s) => [s.id_ingrediente, Number(s._sum.stock_actual ?? 0)]));
  const reservadoDe = new Map(reservado.map((r) => [r.id_ingrediente, Number(r._sum.cantidad ?? 0)]));
  return new Map(
    insumos.map((i) => [
      i.id_ingrediente,
      {
        nombre: i.nombre,
        unidad: i.unidad_medida.abreviatura,
        activo: i.activo,
        costoUnitario: Number(i.costo_unitario),
        stock: stockDe.get(i.id_ingrediente) ?? 0,
        reservado: reservadoDe.get(i.id_ingrediente) ?? 0,
      },
    ]),
  );
}

/** HU-21 · Unidades de cada producto apartadas en reservas activas (pedidos que esperan). */
export async function reservadoDeProductos(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const filas = await prisma.detalle_reserva_producto.groupBy({
    by: ['id_producto'],
    where: { id_producto: { in: ids }, reserva: { estado: 'Activa' } },
    _sum: { cantidad: true },
  });
  return new Map(filas.map((f) => [f.id_producto, Number(f._sum.cantidad ?? 0)]));
}

/** Stock total y lo reservado en reservas activas, por producto. */
export async function saldosDeProductos(tx: ClientePrisma, ids: number[]) {
  const [productos, stock, reservado] = await Promise.all([
    tx.producto.findMany({ where: { id_producto: { in: ids } }, select: { id_producto: true, nombre: true, activo: true } }),
    tx.producto_almacen.groupBy({ by: ['id_producto'], where: { id_producto: { in: ids } }, _sum: { stock_actual: true } }),
    tx.detalle_reserva_producto.groupBy({
      by: ['id_producto'],
      where: { id_producto: { in: ids }, reserva: { estado: 'Activa' } },
      _sum: { cantidad: true },
    }),
  ]);
  const stockDe = new Map(stock.map((s) => [s.id_producto, Number(s._sum.stock_actual ?? 0)]));
  const reservadoDe = new Map(reservado.map((r) => [r.id_producto, Number(r._sum.cantidad ?? 0)]));
  return new Map(
    productos.map((p) => [
      p.id_producto,
      {
        nombre: p.nombre,
        unidad: 'u',
        activo: p.activo,
        costoUnitario: 0,
        stock: stockDe.get(p.id_producto) ?? 0,
        reservado: reservadoDe.get(p.id_producto) ?? 0,
      },
    ]),
  );
}

export const crear = (
  tx: ClientePrisma,
  datos: {
    id: string;
    origen: string;
    idAlmacenDestino: number | null;
    insumos: { idIngrediente: number; cantidad: number }[];
    productos: { idProducto: number; cantidad: number }[];
  },
) =>
  tx.reserva.create({
    data: {
      id_reserva: datos.id,
      origen: datos.origen,
      id_almacen_destino: datos.idAlmacenDestino,
      detalle_reserva_insumo: {
        create: datos.insumos.map((l) => ({ id_ingrediente: l.idIngrediente, cantidad: l.cantidad })),
      },
      detalle_reserva_producto: {
        create: datos.productos.map((l) => ({ id_producto: l.idProducto, cantidad: l.cantidad })),
      },
    },
  });

/** Borra una reserva (liberada) para volver a crearla con el mismo id. */
export async function quitar(tx: ClientePrisma, id: string): Promise<void> {
  await tx.detalle_reserva_insumo.deleteMany({ where: { id_reserva: id } });
  await tx.detalle_reserva_producto.deleteMany({ where: { id_reserva: id } });
  await tx.reserva.delete({ where: { id_reserva: id } });
}

/** Cambia el estado solo si sigue en el esperado; devuelve si lo cambió. */
export async function cerrar(tx: ClientePrisma, id: string, estado: 'Consumida' | 'Liberada'): Promise<boolean> {
  const r = await tx.reserva.updateMany({
    where: { id_reserva: id, estado: 'Activa' },
    data: { estado, cerrada_en: new Date() },
  });
  return r.count === 1;
}

/** Existencias de un insumo por almacén, del que más tiene al que menos (para consumir lo reservado). */
export async function existenciasPorAlmacen(tx: ClientePrisma, idIngrediente: number) {
  const filas = await tx.ingrediente_almacen.findMany({
    where: { id_ingrediente: idIngrediente, stock_actual: { gt: 0 } },
    orderBy: [{ stock_actual: 'desc' }, { id_almacen: 'asc' }],
  });
  return filas.map((f) => ({ idAlmacen: f.id_almacen, stock: Number(f.stock_actual) }));
}

/** Almacenes de un tipo de conservación, el preferido primero. */
export const almacenesDeTipo = (tx: ClientePrisma, tipo: string) =>
  tx.almacen.findMany({
    where: { tipo_conservacion: tipo },
    select: { id_almacen: true, nombre: true, preferido: true },
    orderBy: [{ preferido: 'desc' }, { id_almacen: 'asc' }],
  });
