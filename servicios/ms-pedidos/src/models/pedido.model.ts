import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { recorte } from '../dtos/paginacion.dto.js';
import { rangoDeFechas } from '../utils/fechas.js';

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

/* ------------------------------------------------------------------ */
/* HU-23, HU-24 · Lado del personal (Sprint 5)                          */
/* ------------------------------------------------------------------ */

export interface FiltroGestion {
  estado?: string;
  desde?: string;
  hasta?: string;
  pagina: number;
  porPagina: number;
}

function dondeGestion(filtro: { estado?: string; desde?: string; hasta?: string }): Prisma.pedidoWhereInput {
  const rango = rangoDeFechas(filtro);
  return {
    ...(filtro.estado ? { estado_pedido: filtro.estado } : {}),
    ...(rango ? { fecha: rango } : {}),
  };
}

/** El tablero: los más recientes primero, con su página. */
export const listarTodos = (filtro: FiltroGestion) =>
  prisma.$transaction([
    prisma.pedido.findMany({ where: dondeGestion(filtro), orderBy: { fecha: 'desc' }, include: INCLUIR, ...recorte(filtro) }),
    prisma.pedido.count({ where: dondeGestion(filtro) }),
  ]);

/** Cuántos pedidos hay en cada estado (las pestañas del tablero). */
export const contarPorEstado = (filtro: { desde?: string; hasta?: string }) =>
  prisma.pedido.groupBy({ by: ['estado_pedido'], where: dondeGestion(filtro), _count: { _all: true } });

/** HU-24 · Las entregas del repartidor que todavía no terminaron. */
export const listarDeRepartidor = (idRepartidor: number, estados: string[]) =>
  prisma.pedido.findMany({
    where: { id_repartidor: idRepartidor, estado_pedido: { in: estados } },
    orderBy: { fecha: 'asc' },
    include: INCLUIR,
  });

/** Pedidos activos de cada repartidor: con esto se reparte la carga (HU-23). */
export const cargaDeRepartidores = (estados: string[]) =>
  prisma.pedido.groupBy({
    by: ['id_repartidor'],
    where: { id_repartidor: { not: null }, estado_pedido: { in: estados } },
    _count: { _all: true },
    _min: { fecha: true },
  });

export const cuantosEnCamino = (idRepartidor: number, tx: ClientePrisma = prisma) =>
  tx.pedido.count({ where: { id_repartidor: idRepartidor, estado_pedido: 'En camino' } });

export const asignarRepartidor = (id: number, idRepartidor: number, nombre: string) =>
  prisma.pedido.update({ where: { id_pedido: id }, data: { id_repartidor: idRepartidor, repartidor_nombre: nombre } });

/**
 * Cambia el estado **solo si sigue en el de origen**: dos personas que avanzan el
 * mismo pedido a la vez no lo hacen saltar dos pasos. Devuelve si se aplicó.
 */
export async function cambiarEstadoSiEsta(
  tx: ClientePrisma,
  id: number,
  origen: string,
  datos: { estado: string; motivo?: string | null; fechaEntrega?: Date | null; estadoPago?: string },
): Promise<boolean> {
  const r = await tx.pedido.updateMany({
    where: { id_pedido: id, estado_pedido: origen },
    data: {
      estado_pedido: datos.estado,
      ...(datos.motivo !== undefined ? { motivo_cancelacion: datos.motivo } : {}),
      ...(datos.fechaEntrega !== undefined ? { fecha_entrega: datos.fechaEntrega } : {}),
      ...(datos.estadoPago ? { estado_pago: datos.estadoPago } : {}),
    },
  });
  return r.count === 1;
}

/** Para ms-identidad: cuántos pedidos tiene cada cliente (su ficha, HU-20). */
export const contarPorCliente = (ids: number[]) =>
  prisma.pedido.groupBy({ by: ['id_usuario'], where: { id_usuario: { in: ids } }, _count: { _all: true } });

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
