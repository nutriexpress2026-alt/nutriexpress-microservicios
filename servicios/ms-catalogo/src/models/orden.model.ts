import { prisma } from '../config/prisma.js';
import { recorte, type DatosPaginacion } from '../dtos/paginacion.dto.js';
import type { EstadoOrden } from '../config/dominio.js';

/** Capa Model — órdenes de producción (HU-10). */

const INCLUIR = {
  receta: {
    include: {
      producto: { select: { id_producto: true, nombre: true, tipo_conservacion: true, activo: true } },
      detalle_receta: { include: { insumo: true }, orderBy: { id_ingrediente: 'asc' as const } },
    },
  },
  detalle_orden_insumo: { orderBy: { id_ingrediente: 'asc' as const } },
};

export type OrdenCompleta = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;

export const buscarPorId = (id: number) =>
  prisma.orden_produccion.findUnique({ where: { id_orden_produccion: id }, include: INCLUIR });

export function listar(filtro: DatosPaginacion & { estado?: EstadoOrden }) {
  const where = filtro.estado ? { estado: filtro.estado } : {};
  return Promise.all([
    prisma.orden_produccion.findMany({
      where,
      include: INCLUIR,
      orderBy: [{ fecha: 'desc' }, { id_orden_produccion: 'desc' }],
      ...recorte(filtro),
    }),
    prisma.orden_produccion.count({ where }),
  ]);
}

/** Cuántas órdenes hay en cada estado: el tablero cuenta todas, no las de la página visible. */
export const resumen = () => prisma.orden_produccion.groupBy({ by: ['estado'], _count: { _all: true } });

export const crear = (d: { idReceta: number; cantidad: number; idEmpleado: number; empleadoNombre: string }) =>
  prisma.orden_produccion.create({
    data: { id_receta: d.idReceta, cantidad: d.cantidad, id_empleado: d.idEmpleado, empleado_nombre: d.empleadoNombre },
  });

/** Cambia el estado solo si sigue en uno de los esperados; devuelve si lo cambió. */
export async function cambiarEstado(id: number, desde: EstadoOrden[], a: EstadoOrden): Promise<boolean> {
  const r = await prisma.orden_produccion.updateMany({
    where: { id_orden_produccion: id, estado: { in: desde } },
    data: { estado: a },
  });
  return r.count === 1;
}

/**
 * Deja la orden Finalizada con lo que salió y lo que se consumió, solo si
 * seguía En proceso: si dos pedidos la finalizan a la vez, uno gana.
 */
export const finalizar = (
  id: number,
  d: {
    cantidadObtenida: number;
    costoTotal: number;
    almacen: { id: number; nombre: string } | null;
    insumos: { idIngrediente: number; nombre: string; unidad: string; cantidad: number; costoUnitario: number }[];
  },
) =>
  prisma.$transaction(async (tx) => {
    const r = await tx.orden_produccion.updateMany({
      where: { id_orden_produccion: id, estado: 'En proceso' },
      data: {
        estado: 'Finalizada',
        fecha_finalizacion: new Date(),
        cantidad_obtenida: d.cantidadObtenida,
        costo_total: d.costoTotal,
        id_almacen_destino: d.almacen?.id ?? null,
        almacen_destino: d.almacen?.nombre ?? null,
      },
    });
    if (r.count === 0) return false;
    await tx.detalle_orden_insumo.createMany({
      data: d.insumos.map((l) => ({
        id_orden_produccion: id,
        id_ingrediente: l.idIngrediente,
        nombre: l.nombre,
        unidad: l.unidad,
        cantidad: l.cantidad,
        costo_unitario: l.costoUnitario,
      })),
    });
    return true;
  });

/** Compensación: la finalización no llegó a inventario, la orden vuelve a En proceso. */
export const deshacerFinalizacion = (id: number) =>
  prisma.$transaction([
    prisma.detalle_orden_insumo.deleteMany({ where: { id_orden_produccion: id } }),
    prisma.orden_produccion.update({
      where: { id_orden_produccion: id },
      data: {
        estado: 'En proceso',
        fecha_finalizacion: null,
        cantidad_obtenida: null,
        costo_total: null,
        id_almacen_destino: null,
        almacen_destino: null,
      },
    }),
  ]);

/** Lo que registró inventario (ProduccionRegistrada): las notas y el costo real. */
export const registrarProduccion = (id: number, d: { idNotaEgreso: number; idNotaIngreso: number | null; costoTotal: number }) =>
  prisma.orden_produccion.updateMany({
    where: { id_orden_produccion: id },
    data: { id_nota_egreso: d.idNotaEgreso, id_nota_ingreso: d.idNotaIngreso, costo_total: d.costoTotal },
  });

/** Una receta con órdenes no se elimina: es la historia de lo producido. */
export const contarDeReceta = (idReceta: number) => prisma.orden_produccion.count({ where: { id_receta: idReceta } });
