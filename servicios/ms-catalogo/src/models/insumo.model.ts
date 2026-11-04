import { prisma } from '../config/prisma.js';

/**
 * Capa Model — réplica de los insumos de ms-inventario (HU-09, RNF-ARQ-02).
 * No se edita desde el catálogo: la mantienen el evento InsumoGuardado y la
 * lista completa que se pide al arrancar.
 */

export interface DatosReplicaInsumo {
  id: number;
  nombre: string;
  unidad: string;
  costoUnitario: number;
  activo: boolean;
}

export const guardarReplica = (i: DatosReplicaInsumo) =>
  prisma.insumo.upsert({
    where: { id_ingrediente: i.id },
    update: { nombre: i.nombre, unidad: i.unidad, costo_unitario: i.costoUnitario, activo: i.activo },
    create: {
      id_ingrediente: i.id,
      nombre: i.nombre,
      unidad: i.unidad,
      costo_unitario: i.costoUnitario,
      activo: i.activo,
    },
  });

/**
 * Inventario solo elimina un insumo que ninguna receta usa (lo pregunta antes);
 * si aun así alguna lo tuviera, se conserva dado de baja para no romperla.
 */
export async function quitarReplica(id: number): Promise<void> {
  const enRecetas = await prisma.detalle_receta.count({ where: { id_ingrediente: id } });
  if (enRecetas > 0) {
    await prisma.insumo.updateMany({ where: { id_ingrediente: id }, data: { activo: false } });
  } else {
    await prisma.insumo.deleteMany({ where: { id_ingrediente: id } });
  }
}

export const existentes = (ids: number[]) =>
  prisma.insumo.findMany({ where: { id_ingrediente: { in: ids } } });

/** Cuántas recetas usan el insumo: inventario no lo deja eliminar si hay alguna. */
export const contarRecetasQueLoUsan = (id: number) =>
  prisma.receta.count({ where: { detalle_receta: { some: { id_ingrediente: id } } } });
