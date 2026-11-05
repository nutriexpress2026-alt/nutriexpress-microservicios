import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

/** Capa Model — tablas `pedido` y `detalle_pedido` (HU-21, HU-25). */

/** Cliente de Prisma o transacción en curso: los modelos sirven para las dos. */
export type ClientePrisma = Prisma.TransactionClient;

const INCLUIR = {
  ubicacion: true,
  detalle_pedido: { orderBy: { nombre_producto: 'asc' as const } },
};

export type PedidoConDetalle = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;

export const buscarPorId = (id: number, tx: ClientePrisma = prisma) =>
  tx.pedido.findUnique({ where: { id_pedido: id }, include: INCLUIR });

/** Solo los del cliente: un cliente nunca ve pedidos ajenos (HU-25). */
export const buscarDeCliente = (id: number, idUsuario: number, tx: ClientePrisma = prisma) =>
  tx.pedido.findFirst({ where: { id_pedido: id, id_usuario: idUsuario }, include: INCLUIR });

export const listarDeCliente = (idUsuario: number) =>
  prisma.pedido.findMany({ where: { id_usuario: idUsuario }, orderBy: { fecha: 'desc' }, include: INCLUIR });

export const crear = (
  tx: ClientePrisma,
  datos: {
    idUsuario: number;
    clienteNombre: string;
    idUbicacion: number;
    metodoPago: string;
    estadoPedido: string;
    total: number;
    idReserva: string;
    lineas: { idProducto: number; nombre: string; cantidad: number; precioUnitario: number }[];
  },
) =>
  tx.pedido.create({
    data: {
      id_usuario: datos.idUsuario,
      cliente_nombre: datos.clienteNombre,
      id_ubicacion: datos.idUbicacion,
      metodo_pago: datos.metodoPago,
      estado_pedido: datos.estadoPedido,
      estado_pago: 'Pendiente',
      total: datos.total,
      id_reserva: datos.idReserva,
      detalle_pedido: {
        create: datos.lineas.map((l) => ({
          id_producto: l.idProducto,
          nombre_producto: l.nombre,
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
        })),
      },
    },
    include: INCLUIR,
  });

export const registrarCobro = (id: number, idPago: number) =>
  prisma.pedido.update({ where: { id_pedido: id }, data: { id_pago: idPago } });

/**
 * HU-26 · El cobro se confirmó: el pedido sale de «Pendiente de pago» y entra a
 * la cocina. La condición va en el propio `updateMany`: si dos avisos llegan a
 * la vez, solo uno lo cambia. Devuelve si se aplicó.
 */
export async function marcarPagado(id: number, referencia: string | null): Promise<boolean> {
  const r = await prisma.pedido.updateMany({
    where: { id_pedido: id, estado_pedido: 'Pendiente de pago' },
    data: { estado_pedido: 'Recibido', estado_pago: 'Pagado', referencia_pago: referencia },
  });
  return r.count === 1;
}

/**
 * Cancela el pedido si sigue en uno de los estados permitidos. Igual que
 * `marcarPagado`, la condición viaja en la escritura: el cliente que cancela y
 * el vencimiento del cobro pueden cruzarse, y solo uno debe ganar.
 */
export async function cancelarSiEsta(
  id: number,
  estados: string[],
  motivo: string,
  estadoPago?: string,
): Promise<boolean> {
  const r = await prisma.pedido.updateMany({
    where: { id_pedido: id, estado_pedido: { in: estados } },
    data: {
      estado_pedido: 'Cancelado',
      motivo_cancelacion: motivo,
      ...(estadoPago ? { estado_pago: estadoPago } : {}),
    },
  });
  return r.count === 1;
}
