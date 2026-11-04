import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { contieneTodas, limite } from './busqueda-texto.js';
import type { ClientePrisma } from './stock.model.js';

/**
 * Capa Model — clases de análisis tblIngrediente y tblUnidadMedida.
 *
 * Las escrituras devuelven solo el identificador y el servicio vuelve a leer:
 * un `select` con relaciones dentro de un `create` o un `update` hace que
 * Prisma las cargue en paralelo sobre el cliente fijado por su transacción
 * implícita, algo que `pg` marca como obsoleto.
 */

const CAMPOS = {
  id_ingrediente: true,
  nombre: true,
  stock_minimo: true,
  costo_unitario: true,
  activo: true,
  tipo_conservacion: true,
  controla_vencimiento: true,
  unidad_medida: { select: { id_unidad: true, nombre: true, abreviatura: true } },
  ingrediente_almacen: {
    select: {
      stock_actual: true,
      almacen: { select: { id_almacen: true, nombre: true } },
    },
  },
} as const;

export interface FiltroInsumos {
  termino?: string;
  soloActivos?: boolean;
}

/** Insumos cuyo nombre contiene todas las palabras buscadas, sin importar tildes. */
export async function idsQueCoinciden(termino: string, tope?: number): Promise<number[]> {
  const filas = await prisma.$queryRaw<{ id_ingrediente: number }[]>`
    SELECT id_ingrediente FROM ingrediente
    WHERE ${contieneTodas(Prisma.sql`nombre`, termino)}
    ORDER BY nombre
    ${limite(tope)}`;
  return filas.map((f) => f.id_ingrediente);
}

/** Condición de búsqueda por texto, lista para un `where`. */
export const porTexto = async (termino?: string) =>
  termino ? { id_ingrediente: { in: await idsQueCoinciden(termino) } } : {};

/** Los primeros insumos que coinciden, con su existencia, para el buscador general. */
export async function coincidencias(termino: string, tope: number) {
  return prisma.ingrediente.findMany({
    where: { id_ingrediente: { in: await idsQueCoinciden(termino, tope) } },
    select: {
      id_ingrediente: true,
      nombre: true,
      activo: true,
      unidad_medida: { select: { abreviatura: true } },
      ingrediente_almacen: { select: { stock_actual: true } },
    },
    orderBy: { nombre: 'asc' },
  });
}

export const listar = async (filtro: FiltroInsumos) =>
  prisma.ingrediente.findMany({
    where: {
      ...(filtro.soloActivos ? { activo: true } : {}),
      ...(await porTexto(filtro.termino)),
    },
    select: CAMPOS,
    orderBy: { nombre: 'asc' },
  });

export const buscarPorId = (id: number) =>
  prisma.ingrediente.findUnique({ where: { id_ingrediente: id }, select: CAMPOS });

/** Nace sin costo (`costo_unitario` en 0): lo fija su primera compra. */
export const crear = (datos: {
  nombre: string;
  idUnidad: number;
  stockMinimo: number;
  tipoConservacion: string;
  controlaVencimiento: boolean;
}) =>
  prisma.ingrediente.create({
    data: {
      nombre: datos.nombre,
      id_unidad: datos.idUnidad,
      stock_minimo: datos.stockMinimo,
      tipo_conservacion: datos.tipoConservacion,
      controla_vencimiento: datos.controlaVencimiento,
    },
    select: { id_ingrediente: true },
  });

export const actualizar = (
  id: number,
  datos: {
    nombre?: string;
    idUnidad?: number;
    stockMinimo?: number;
    activo?: boolean;
    tipoConservacion?: string;
    controlaVencimiento?: boolean;
  },
) =>
  prisma.ingrediente.update({
    where: { id_ingrediente: id },
    data: {
      ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
      ...(datos.idUnidad !== undefined ? { id_unidad: datos.idUnidad } : {}),
      ...(datos.stockMinimo !== undefined ? { stock_minimo: datos.stockMinimo } : {}),
      ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
      ...(datos.tipoConservacion !== undefined
        ? { tipo_conservacion: datos.tipoConservacion }
        : {}),
      ...(datos.controlaVencimiento !== undefined
        ? { controla_vencimiento: datos.controlaVencimiento }
        : {}),
    },
    select: { id_ingrediente: true },
  });

export const eliminar = (id: number) =>
  prisma.ingrediente.delete({ where: { id_ingrediente: id } });

/** CU-INV-01: no se puede cambiar la unidad de un insumo que ya registra existencias. */
export const contarExistencias = (id: number) =>
  prisma.ingrediente_almacen.count({
    where: { id_ingrediente: id, stock_actual: { gt: 0 } },
  });

/**
 * Las recetas viven en ms-catalogo (Sprint 3): hasta que existan no hay a quién
 * preguntar, y el insumo no está en ninguna. En el Sprint 3 esto pasa a ser
 * una consulta REST a ms-catalogo.
 */
/**
 * Lo que la réplica de insumos de ms-catalogo necesita (HU-09): todos los
 * insumos, o solo los indicados. La unidad va por su abreviatura (kg, L, u).
 */
export async function paraReplica(ids?: number[]) {
  const filas = await prisma.ingrediente.findMany({
    where: ids ? { id_ingrediente: { in: ids } } : undefined,
    select: {
      id_ingrediente: true,
      nombre: true,
      costo_unitario: true,
      activo: true,
      unidad_medida: { select: { abreviatura: true } },
    },
    orderBy: { id_ingrediente: 'asc' },
  });
  return filas.map((i) => ({
    id: i.id_ingrediente,
    nombre: i.nombre,
    unidad: i.unidad_medida.abreviatura,
    costoUnitario: Number(i.costo_unitario),
    activo: i.activo,
  }));
}

/** Movimientos históricos: notas de ingreso y de egreso que tocaron el insumo. */
export async function contarMovimientos(id: number): Promise<number> {
  const [ingresos, egresos] = await Promise.all([
    prisma.detalle_ingreso_insumo.count({ where: { id_ingrediente: id } }),
    prisma.detalle_egreso_insumo.count({ where: { id_ingrediente: id } }),
  ]);
  return ingresos + egresos;
}

export const listarUnidades = () =>
  prisma.unidad_medida.findMany({
    select: { id_unidad: true, nombre: true, abreviatura: true },
    orderBy: { nombre: 'asc' },
  });

export const buscarUnidad = (id: number) =>
  prisma.unidad_medida.findUnique({
    where: { id_unidad: id },
    select: { id_unidad: true, nombre: true },
  });

export type InsumoConsultado = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;

/** Insumos existentes entre los indicados; `soloActivos` filtra las bajas lógicas. */
export const existentes = (ids: number[], tx: ClientePrisma, soloActivos: boolean) =>
  tx.ingrediente.findMany({
    where: { id_ingrediente: { in: ids }, ...(soloActivos ? { activo: true } : {}) },
    select: {
      id_ingrediente: true,
      nombre: true,
      tipo_conservacion: true,
      controla_vencimiento: true,
    },
  });

/** Costo vigente de los insumos indicados, para recalcularlo tras una compra. */
export const costosActuales = (ids: number[], tx: ClientePrisma) =>
  tx.ingrediente.findMany({
    where: { id_ingrediente: { in: ids } },
    select: { id_ingrediente: true, costo_unitario: true },
  });

/** Deja el costo del insumo en el promedio ponderado recién calculado. */
export const fijarCosto = (tx: ClientePrisma, id: number, costo: number) =>
  tx.ingrediente.update({
    where: { id_ingrediente: id },
    data: { costo_unitario: costo },
    select: { id_ingrediente: true },
  });
