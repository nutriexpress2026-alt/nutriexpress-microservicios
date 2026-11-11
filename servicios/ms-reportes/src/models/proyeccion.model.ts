import type { Filter } from 'mongodb';
import { bd } from '../config/mongo.js';
import type { FotoPedido, FotoVenta } from '../dtos/reporte.dto.js';

/**
 * Capa Model — la copia de ventas y pedidos con que ms-reportes arma los
 * reportes (HU-28, HU-29). Es un **modelo de lectura**: no es la fuente de
 * verdad (esa es la base de ms-ventas y la de ms-pedidos), es la última «foto»
 * que esos servicios publicaron, guardada como un documento listo para
 * consultar por fechas (RNF-ARQ-02: ms-reportes no lee bases ajenas).
 *
 * Las fechas se guardan como `Date` para poder filtrar por rango. Cada documento
 * guarda `actualizadoEn` de su foto: una foto más vieja no pisa a una más nueva
 * (llegan por eventos y también en la lista completa al arrancar).
 */

export interface DocVenta extends Omit<FotoVenta, 'fecha' | 'actualizadoEn' | 'idVenta'> {
  _id: number;
  fecha: Date;
  actualizadoEn: Date;
}

export interface DocPedido extends Omit<FotoPedido, 'fechaPedido' | 'fechaEntrega' | 'actualizadoEn' | 'idPedido'> {
  _id: number;
  fechaPedido: Date;
  fechaEntrega: Date | null;
  actualizadoEn: Date;
}

const ventas = async () => (await bd()).collection<DocVenta>('ventas');
const pedidos = async () => (await bd()).collection<DocPedido>('pedidos');

/** Crea los índices por fecha la primera vez (repetirlo no hace nada). */
export async function prepararIndices(): Promise<void> {
  await (await ventas()).createIndex({ fecha: 1 });
  await (await pedidos()).createIndex({ fechaPedido: 1 });
}

/**
 * Guarda la foto de una venta si es más nueva que la que había. Devuelve la
 * anterior (o null), y si se aplicó.
 */
export async function aplicarVenta(foto: FotoVenta): Promise<{ anterior: DocVenta | null; aplicada: boolean }> {
  const { idVenta, fecha, actualizadoEn, ...resto } = foto;
  const doc: DocVenta = { _id: idVenta, ...resto, fecha: new Date(fecha), actualizadoEn: new Date(actualizadoEn) };
  const c = await ventas();
  const anterior = await c.findOne({ _id: idVenta });
  if (anterior && anterior.actualizadoEn > doc.actualizadoEn) return { anterior, aplicada: false };
  await c.replaceOne({ _id: idVenta }, doc, { upsert: true });
  return { anterior, aplicada: true };
}

export async function aplicarPedido(foto: FotoPedido): Promise<{ anterior: DocPedido | null; aplicada: boolean }> {
  const { idPedido, fechaPedido, fechaEntrega, actualizadoEn, ...resto } = foto;
  const doc: DocPedido = {
    _id: idPedido,
    ...resto,
    fechaPedido: new Date(fechaPedido),
    fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
    actualizadoEn: new Date(actualizadoEn),
  };
  const c = await pedidos();
  const anterior = await c.findOne({ _id: idPedido });
  if (anterior && anterior.actualizadoEn > doc.actualizadoEn) return { anterior, aplicada: false };
  await c.replaceOne({ _id: idPedido }, doc, { upsert: true });
  return { anterior, aplicada: true };
}

/** Las ventas de un período (todas: el servicio decide qué suma y qué no). */
export async function ventasDelPeriodo(f: { desde: Date; hasta: Date; idProducto?: number; idVendedor?: number }) {
  const filtro: Filter<DocVenta> = { fecha: { $gte: f.desde, $lte: f.hasta } };
  if (f.idProducto) filtro['items.idProducto'] = f.idProducto;
  if (f.idVendedor) filtro['vendedor.id'] = f.idVendedor;
  return (await ventas()).find(filtro).sort({ fecha: 1 }).toArray();
}

export async function pedidosDelPeriodo(f: { desde: Date; hasta: Date; estado?: string; idRepartidor?: number; idProducto?: number }) {
  const filtro: Filter<DocPedido> = { fechaPedido: { $gte: f.desde, $lte: f.hasta } };
  if (f.estado) filtro.estado = f.estado;
  if (f.idRepartidor) filtro['repartidor.id'] = f.idRepartidor;
  if (f.idProducto) filtro['items.idProducto'] = f.idProducto;
  return (await pedidos()).find(filtro).sort({ fechaPedido: 1 }).toArray();
}

/** Los vendedores que alguna vez vendieron, para el filtro del reporte (HU-28). */
export async function vendedores(): Promise<{ id: number; nombre: string }[]> {
  const filas = await (await ventas())
    .aggregate<{ _id: number; nombre: string }>([
      { $sort: { fecha: -1 } },
      { $group: { _id: '$vendedor.id', nombre: { $first: '$vendedor.nombre' } } },
      { $sort: { nombre: 1 } },
    ])
    .toArray();
  return filas.map((f) => ({ id: f._id, nombre: f.nombre }));
}

/** El nombre de un producto según lo vendido (para el título del reporte). */
export async function nombreDeProducto(idProducto: number): Promise<string | null> {
  for (const c of [await ventas(), await pedidos()] as const) {
    const doc = await (c as Awaited<ReturnType<typeof ventas>>).findOne(
      { 'items.idProducto': idProducto },
      { projection: { items: 1 } },
    );
    const linea = doc?.items.find((l) => l.idProducto === idProducto);
    if (linea) return linea.nombre;
  }
  return null;
}

export async function nombreDeRepartidor(idRepartidor: number): Promise<string | null> {
  return (await (await pedidos()).findOne({ 'repartidor.id': idRepartidor }))?.repartidor?.nombre ?? null;
}

export async function nombreDeVendedor(idVendedor: number): Promise<string | null> {
  return (await (await ventas()).findOne({ 'vendedor.id': idVendedor }))?.vendedor.nombre ?? null;
}
