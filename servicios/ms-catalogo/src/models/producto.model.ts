import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { contieneTodas, limite } from './busqueda-texto.js';

/** Capa Model — clases de análisis tblProducto, tblCategoria y tblValorNutricional. */

/**
 * Proyección pública de un producto.
 *
 * Se enumeran los campos uno a uno de forma deliberada: la receta, sus
 * instrucciones y los costos de los insumos no deben salir del servidor
 * hacia el portal.
 */
const CAMPOS_PUBLICOS = {
  id_producto: true,
  nombre: true,
  descripcion: true,
  precio_venta: true,
  categoria: { select: { id_categoria: true, nombre: true } },
  valor_nutricional: {
    select: {
      calorias: true,
      proteinas_g: true,
      carbohidratos_g: true,
      grasas_g: true,
      fibra_g: true,
    },
  },
  // Solo la fecha, no la imagen: un listado con muchos productos no tiene por
  // qué traer los bytes de cada foto para saber si existe. La fecha alcanza
  // para decidirlo y además sirve para invalidar la caché del navegador
  // cuando la foto cambia (`GET /catalogo/:id/imagen`).
  imagen_actualizada_en: true,
} as const;

export interface FiltroCatalogo {
  termino?: string;
  idCategoria?: number;
}

/**
 * Productos cuyo nombre o categoría contienen todas las palabras buscadas,
 * sin importar tildes ni mayúsculas: «jugo limon» encuentra el «Jugo de
 * limón», que antes no aparecía ni por la tilde ni por el «de» del medio.
 */
export async function idsQueCoinciden(termino: string, tope?: number): Promise<number[]> {
  const filas = await prisma.$queryRaw<{ id_producto: number }[]>`
    SELECT p.id_producto FROM producto p
    JOIN categoria c ON c.id_categoria = p.id_categoria
    WHERE ${contieneTodas(Prisma.sql`concat_ws(' ', p.nombre, c.nombre)`, termino)}
    ORDER BY p.nombre
    ${limite(tope)}`;
  return filas.map((f) => f.id_producto);
}

/** Condición de búsqueda por texto, lista para un `where`. */
export const porTexto = async (termino?: string) =>
  termino ? { id_producto: { in: await idsQueCoinciden(termino) } } : {};

/** Los primeros productos que coinciden, activos o no, para el buscador general. */
export async function coincidencias(termino: string, tope: number) {
  return prisma.producto.findMany({
    where: { id_producto: { in: await idsQueCoinciden(termino, tope) } },
    select: {
      id_producto: true,
      nombre: true,
      precio_venta: true,
      activo: true,
      categoria: { select: { nombre: true } },
    },
    orderBy: { nombre: 'asc' },
  });
}

/**
 * Consulta los productos activos por coincidencia parcial de nombre y por
 * categoría (CU-PED-01), sin distinguir tildes ni mayúsculas.
 */
export const buscarActivos = async (filtro: FiltroCatalogo) =>
  prisma.producto.findMany({
    where: {
      activo: true,
      ...(filtro.idCategoria ? { id_categoria: filtro.idCategoria } : {}),
      ...(await porTexto(filtro.termino)),
    },
    select: CAMPOS_PUBLICOS,
    orderBy: [{ id_categoria: 'asc' }, { nombre: 'asc' }],
  });

export const buscarActivoPorId = (id: number) =>
  prisma.producto.findFirst({ where: { id_producto: id, activo: true }, select: CAMPOS_PUBLICOS });

export const listarCategorias = () =>
  prisma.categoria.findMany({
    select: { id_categoria: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });

export type ProductoPublico = Awaited<ReturnType<typeof buscarActivos>>[number];

/* ------------------------------------------------------------------ */
/* CU-PRO-01 — lado de gestión                                         */
/* ------------------------------------------------------------------ */

/**
 * Las escrituras devuelven solo el identificador y el servicio vuelve a leer
 * con la proyección completa. Pedirle a Prisma un `select` con varias
 * relaciones dentro de un `create` o un `update` hace que cargue esas
 * relaciones en paralelo sobre el cliente que la transacción implícita tiene
 * fijado, lo que `pg` marca como obsoleto y dejará de admitir en su versión 9.
 */

/**
 * Proyección para el personal: agrega el estado y las existencias.
 *
 * No incluye la relación `receta` a propósito. El esquema declara el índice
 * parcial `ux_receta_activa ON receta(id_producto) WHERE activa`, y Prisma lo
 * introspecta como un UNIQUE completo: por eso modela `producto.receta` como
 * uno a uno, cuando en realidad un producto tiene varias versiones y solo una
 * activa. Las recetas se consultan por su propio modelo.
 */
const CAMPOS_GESTION = {
  id_producto: true,
  nombre: true,
  descripcion: true,
  precio_venta: true,
  activo: true,
  tipo_conservacion: true,
  categoria: { select: { id_categoria: true, nombre: true } },
  valor_nutricional: {
    select: {
      calorias: true,
      proteinas_g: true,
      carbohidratos_g: true,
      grasas_g: true,
      fibra_g: true,
    },
  },
  imagen_actualizada_en: true,
} as const;

export interface FiltroGestion {
  termino?: string;
  idCategoria?: number;
  incluirInactivos?: boolean;
}

export const listarParaGestion = async (filtro: FiltroGestion) =>
  prisma.producto.findMany({
    where: {
      ...(filtro.incluirInactivos ? {} : { activo: true }),
      ...(filtro.idCategoria ? { id_categoria: filtro.idCategoria } : {}),
      ...(await porTexto(filtro.termino)),
    },
    select: CAMPOS_GESTION,
    orderBy: [{ id_categoria: 'asc' }, { nombre: 'asc' }],
  });

export const buscarParaGestion = (id: number) =>
  prisma.producto.findUnique({ where: { id_producto: id }, select: CAMPOS_GESTION });

export const crear = (datos: {
  nombre: string;
  descripcion: string | null;
  precioVenta: number;
  idCategoria: number;
  tipoConservacion: string;
}) =>
  prisma.producto.create({
    data: {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      precio_venta: datos.precioVenta,
      tipo_conservacion: datos.tipoConservacion,
      id_categoria: datos.idCategoria,
    },
    select: { id_producto: true },
  });

export const actualizar = (
  id: number,
  datos: {
    nombre?: string;
    descripcion?: string | null;
    precioVenta?: number;
    idCategoria?: number;
    activo?: boolean;
    tipoConservacion?: string;
  },
) =>
  prisma.producto.update({
    where: { id_producto: id },
    data: {
      ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
      ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion } : {}),
      ...(datos.precioVenta !== undefined ? { precio_venta: datos.precioVenta } : {}),
      ...(datos.idCategoria !== undefined ? { id_categoria: datos.idCategoria } : {}),
      ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
      ...(datos.tipoConservacion !== undefined
        ? { tipo_conservacion: datos.tipoConservacion }
        : {}),
    },
    select: { id_producto: true },
  });

export const eliminar = (id: number) => prisma.producto.delete({ where: { id_producto: id } });

export const buscarCategoria = (id: number) =>
  prisma.categoria.findUnique({ where: { id_categoria: id }, select: { id_categoria: true } });

// Las existencias, las ventas y los pedidos de un producto viven en otros
// microservicios: antes de eliminarlo, producto.service le pregunta a
// ms-inventario (las recetas se suman en el Sprint 3).

/** CU-PRO-03 — Registrar Valor Nutricional. Extiende a CU-PRO-01 y es opcional. */
export const guardarValorNutricional = (
  idProducto: number,
  datos: {
    calorias: number;
    proteinas: number;
    carbohidratos: number;
    grasas: number;
    fibra: number | null;
  },
) => {
  const fila = {
    calorias: datos.calorias,
    proteinas_g: datos.proteinas,
    carbohidratos_g: datos.carbohidratos,
    grasas_g: datos.grasas,
    fibra_g: datos.fibra,
  };
  return prisma.valor_nutricional.upsert({
    where: { id_producto: idProducto },
    update: fila,
    create: { id_producto: idProducto, ...fila },
  });
};

export type ProductoGestion = NonNullable<Awaited<ReturnType<typeof buscarParaGestion>>>;

/**
 * La foto de un producto, en una consulta aparte de `CAMPOS_PUBLICOS` y
 * `CAMPOS_GESTION`: son los únicos dos lugares donde hace falta traer los
 * bytes completos, y solo cuando se va a servir la imagen misma.
 */
export const buscarImagen = (id: number) =>
  prisma.producto.findUnique({
    where: { id_producto: id },
    select: { imagen: true, imagen_tipo: true },
  });

export const guardarImagen = (id: number, datos: Buffer, tipo: string) =>
  prisma.producto.update({
    where: { id_producto: id },
    // `Buffer` es un `Uint8Array<ArrayBufferLike>`; el campo `Bytes` de Prisma
    // exige el `ArrayBuffer` concreto. `Uint8Array.from` copia los bytes a uno.
    data: {
      imagen: Uint8Array.from(datos),
      imagen_tipo: tipo,
      imagen_actualizada_en: new Date(),
    },
    select: { id_producto: true },
  });

export const eliminarImagen = (id: number) =>
  prisma.producto.update({
    where: { id_producto: id },
    data: { imagen: null, imagen_tipo: null, imagen_actualizada_en: null },
    select: { id_producto: true },
  });

/** Lista para la réplica de ms-inventario (GET /interno/productos). */
/** HU-21 · El precio de hoy de los productos de un pedido (lo pide ms-pedidos). */
export const preciosDe = (ids: number[]) =>
  prisma.producto.findMany({
    where: { id_producto: { in: ids } },
    select: { id_producto: true, nombre: true, precio_venta: true, activo: true },
  });

export const paraReplica = () =>
  prisma.producto.findMany({
    select: { id_producto: true, nombre: true, tipo_conservacion: true, activo: true },
    orderBy: { id_producto: 'asc' },
  });
