import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { recorte } from '../dtos/paginacion.dto.js';
import { rangoDeFechas } from '../utils/fechas.js';

/** Capa Model — tablas `venta` y `detalle_venta` (HU-18, HU-19). */

export type ClientePrisma = Prisma.TransactionClient;

const INCLUIR = { detalle_venta: { orderBy: [{ nombre_producto: 'asc' as const }, { id_almacen: 'asc' as const }] } };

export type VentaConsultada = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;

export const buscarPorId = (id: number, tx: ClientePrisma = prisma) =>
  tx.venta.findUnique({ where: { id_venta: id }, include: INCLUIR });

export interface FiltroVentas {
  tipo?: string;
  cliente?: number;
  desde?: string;
  hasta?: string;
  pagina: number;
  porPagina: number;
}

function donde(f: FiltroVentas): Prisma.ventaWhereInput {
  return {
    ...(f.tipo ? { tipo_venta: f.tipo } : {}),
    ...(f.cliente ? { id_cliente: f.cliente } : {}),
    fecha: rangoDeFechas(f),
  };
}

export const listar = (f: FiltroVentas) =>
  prisma.$transaction([
    prisma.venta.findMany({ where: donde(f), orderBy: { fecha: 'desc' }, include: INCLUIR, ...recorte(f) }),
    prisma.venta.count({ where: donde(f) }),
  ]);

export const crear = (
  tx: ClientePrisma,
  d: {
    tipoVenta: string;
    metodoPago: string;
    estadoPago: string;
    total: number;
    idCliente: number | null;
    clienteNombre: string | null;
    empleado: { id: number; nombre: string; apellido: string };
    idReserva: string;
    idNotaEgreso: number | null;
    lineas: { idProducto: number; idAlmacen: number; nombre: string; almacen: string; cantidad: number; precioUnitario: number; costoUnitario?: number }[];
  },
) =>
  tx.venta.create({
    data: {
      tipo_venta: d.tipoVenta,
      metodo_pago: d.metodoPago,
      estado_pago: d.estadoPago,
      total: d.total,
      id_cliente: d.idCliente,
      cliente_nombre: d.clienteNombre,
      id_empleado: d.empleado.id,
      empleado_nombre: d.empleado.nombre,
      empleado_apellido: d.empleado.apellido,
      id_reserva: d.idReserva,
      id_nota_egreso: d.idNotaEgreso,
      detalle_venta: {
        create: d.lineas.map((l) => ({
          id_producto: l.idProducto,
          id_almacen: l.idAlmacen,
          nombre_producto: l.nombre,
          nombre_almacen: l.almacen,
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
          costo_unitario: l.costoUnitario ?? null,
        })),
      },
    },
    include: INCLUIR,
  });

/** HU-28 · Todas, con su detalle: ms-reportes las pide al arrancar. */
export const todas = () => prisma.venta.findMany({ include: INCLUIR, orderBy: { id_venta: 'asc' } });

export const registrarCobro = (id: number, idPago: number) => prisma.venta.update({ where: { id_venta: id }, data: { id_pago: idPago } });

/** El cobro con QR se acreditó. Solo si seguía pendiente: un aviso repetido no hace nada. */
export async function marcarPagada(id: number): Promise<boolean> {
  const r = await prisma.venta.updateMany({ where: { id_venta: id, estado_pago: 'Pendiente' }, data: { estado_pago: 'Pagado' } });
  return r.count === 1;
}

/** Anula solo si no estaba anulada: dos anulaciones a la vez no devuelven el stock dos veces. */
export async function anularSiNoLoEsta(id: number, motivo: string): Promise<boolean> {
  const r = await prisma.venta.updateMany({
    where: { id_venta: id, estado_pago: { not: 'Anulado' } },
    data: { estado_pago: 'Anulado', motivo_anulacion: motivo, anulada_en: new Date() },
  });
  return r.count === 1;
}

/** Para ms-identidad: cuántas ventas tiene cada cliente (su ficha, HU-20). */
export const contarPorCliente = (ids: number[]) =>
  prisma.venta.groupBy({ by: ['id_cliente'], where: { id_cliente: { in: ids } }, _count: { _all: true } });
