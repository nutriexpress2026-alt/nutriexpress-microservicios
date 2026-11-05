import { prisma } from '../config/prisma.js';
import type { DatosReceta } from '../dtos/receta.dto.js';

/** Capa Model — recetas y su detalle de insumos (HU-09, RF-PRO-04). */

const INCLUIR = {
  producto: { select: { id_producto: true, nombre: true, activo: true } },
  detalle_receta: { include: { insumo: true }, orderBy: { id_ingrediente: 'asc' as const } },
};

export type RecetaCompleta = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;

export const buscarPorId = (id: number) =>
  prisma.receta.findUnique({ where: { id_receta: id }, include: INCLUIR });

/** Las versiones de un producto: la activa primero, después la más reciente. */
export const listarDeProducto = (idProducto: number) =>
  prisma.receta.findMany({
    where: { id_producto: idProducto },
    include: INCLUIR,
    orderBy: [{ activa: 'desc' }, { id_receta: 'desc' }],
  });

const campos = (d: DatosReceta) => ({
  nombre: d.nombre,
  rendimiento: d.rendimiento,
  tiempo_preparacion_minutos: d.tiempoPreparacionMinutos,
  instrucciones: d.instrucciones ?? null,
  divisible: d.divisible,
});

const lineas = (d: DatosReceta) =>
  d.insumos.map((l) => ({ id_ingrediente: l.idIngrediente, cantidad_requerida: l.cantidadRequerida }));

/** Una versión nueva nace inactiva: activarla es otra operación. */
export const crear = (idProducto: number, d: DatosReceta) =>
  prisma.receta.create({
    data: { id_producto: idProducto, activa: false, ...campos(d), detalle_receta: { create: lineas(d) } },
  });

/** Cambia los datos y reemplaza las líneas, en una transacción. */
export const actualizar = (id: number, d: DatosReceta) =>
  prisma.$transaction([
    prisma.detalle_receta.deleteMany({ where: { id_receta: id } }),
    prisma.receta.update({ where: { id_receta: id }, data: { ...campos(d), detalle_receta: { create: lineas(d) } } }),
  ]);

/**
 * Activa una versión y desactiva la que estaba activa, en la misma transacción
 * (RF-PRO-04). El índice parcial ux_receta_activa rechazaría dos activas.
 */
export const activar = (id: number, idProducto: number) =>
  prisma.$transaction([
    prisma.receta.updateMany({ where: { id_producto: idProducto, activa: true }, data: { activa: false } }),
    prisma.receta.update({ where: { id_receta: id }, data: { activa: true } }),
  ]);

export const eliminar = (id: number) => prisma.receta.delete({ where: { id_receta: id } });

/** Un producto con recetas no se elimina: se da de baja. */
export const contarDeProducto = (idProducto: number) => prisma.receta.count({ where: { id_producto: idProducto } });
