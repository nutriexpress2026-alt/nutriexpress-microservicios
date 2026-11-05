import { randomUUID } from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { publicar, type Evento } from '../config/eventos.js';
import * as pedidoModel from '../models/pedido.model.js';
import * as posicionModel from '../models/posicion.model.js';
import type { ClientePrisma, PedidoConDetalle } from '../models/pedido.model.js';
import * as servicios from '../clientes/servicios.js';
import * as ubicacionService from './ubicacion.service.js';
import { exigirCliente } from './cliente.service.js';
import { avisar } from './aviso.service.js';
import {
  ESTADOS_CANCELABLES,
  esCancelable,
  requiereCobroEnLinea,
  type EstadoPedido,
  type MetodoPago,
  type MotivoCancelacion,
} from '../config/dominio.js';
import type {
  ComprobantePedidoDTO,
  DatosConfirmarPedido,
  LineaPedidoDTO,
  PedidoDetalleDTO,
  SeguimientoDTO,
} from '../dtos/pedido.dto.js';
import type { Sesion } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * HU-21, HU-25, HU-26 · El pedido a domicilio, del lado del cliente.
 *
 * Saga del pedido (sección 3.1.7), repartida entre tres servicios que no
 * comparten base (RNF-ARQ-02):
 *
 * 1. Confirmar: el catálogo da los precios, inventario **reserva** el stock
 *    (HU-17) y, si se paga en línea, ms-pagos abre el cobro. Las tres son REST
 *    porque el cliente necesita la respuesta en el momento: si hay stock y cuál
 *    es su QR. Si un paso falla, se deshacen los anteriores (compensación).
 * 2. El desenlace del cobro llega como evento: PagoConfirmado pasa el pedido a
 *    Recibido; PagoFallido (vencido o anulado) lo cancela.
 * 3. Cancelar publica PedidoCancelado: ms-inventario libera la reserva y
 *    ms-pagos cierra el cobro pendiente.
 *
 * Adaptado del sistema anterior: allí todo era una transacción de la misma
 * base; aquí cada paso tiene su compensación.
 */

/** Suma en centavos: sin arrastre de error del punto flotante. */
export function calcularTotal(lineas: { cantidad: number; precioUnitario: number }[]): number {
  return lineas.reduce((t, l) => t + Math.round(l.precioUnitario * 100) * l.cantidad, 0) / 100;
}

/** Pedir dos veces el mismo producto suma las cantidades en una línea. */
function consolidarItems(items: DatosConfirmarPedido['items']) {
  const porProducto = new Map<number, number>();
  for (const i of items) porProducto.set(i.idProducto, (porProducto.get(i.idProducto) ?? 0) + i.cantidad);
  return [...porProducto].map(([idProducto, cantidad]) => ({ idProducto, cantidad }));
}

function aDetalleDTO(p: PedidoConDetalle): PedidoDetalleDTO {
  const estado = p.estado_pedido as EstadoPedido;
  const items: LineaPedidoDTO[] = p.detalle_pedido.map((d) => {
    const precioUnitario = Number(d.precio_unitario);
    return {
      idProducto: d.id_producto,
      nombre: d.nombre_producto,
      cantidad: d.cantidad,
      precioUnitario,
      subtotal: calcularTotal([{ cantidad: d.cantidad, precioUnitario }]),
    };
  });
  return {
    id: p.id_pedido,
    fecha: p.fecha.toISOString(),
    estadoPedido: estado,
    estadoPago: p.estado_pago,
    metodoPago: p.metodo_pago as MetodoPago,
    total: Number(p.total),
    fechaEntrega: p.fecha_entrega?.toISOString() ?? null,
    cancelable: esCancelable(estado),
    motivoCancelacion: (p.motivo_cancelacion as MotivoCancelacion | null) ?? null,
    referenciaPago: p.referencia_pago,
    ubicacion: {
      calle: p.ubicacion.calle,
      numero: p.ubicacion.numero,
      referencia: p.ubicacion.referencia,
      latitud: p.ubicacion.latitud === null ? null : Number(p.ubicacion.latitud),
      longitud: p.ubicacion.longitud === null ? null : Number(p.ubicacion.longitud),
    },
    items,
  };
}

/** Para ms-reportes (Sprint 6): cada cambio de estado del pedido, con lo que un reporte necesita. */
function avisarEstado(p: PedidoConDetalle, estado: EstadoPedido, motivo: string | null = null) {
  return avisar('PedidoEstadoCambiado', {
    idPedido: p.id_pedido,
    idUsuario: p.id_usuario,
    cliente: p.cliente_nombre,
    estado,
    motivo,
    metodoPago: p.metodo_pago,
    total: Number(p.total),
    fecha: new Date().toISOString(),
  });
}

/**
 * Compensación de un pedido cancelado: publica PedidoCancelado, que libera la
 * reserva en ms-inventario y cierra el cobro pendiente en ms-pagos. Si RabbitMQ
 * no responde, la reserva se libera igual por REST: el stock no puede quedar
 * congelado por un pedido que ya no existe (RNF-DIS-01).
 */
async function compensarCancelacion(p: PedidoConDetalle, motivo: MotivoCancelacion): Promise<void> {
  try {
    await publicar('PedidoCancelado', { idPedido: p.id_pedido, idReserva: p.id_reserva, motivo });
  } catch {
    await servicios.liberar(p.id_reserva).catch((e) =>
      console.error(`ms-pedidos: no se pudo liberar la reserva ${p.id_reserva} (${(e as Error).message})`),
    );
  }
  await avisarEstado(p, 'Cancelado', motivo);
}

/* ------------------------------------------------------------------ */
/* HU-21 · Confirmar el pedido                                         */
/* ------------------------------------------------------------------ */

export async function confirmar(sesion: Sesion, datos: DatosConfirmarPedido): Promise<PedidoDetalleDTO> {
  const cliente = exigirCliente(sesion, 'hacer pedidos');
  const items = consolidarItems(datos.items);

  // RNF-SEG-03: el precio de hoy, del catálogo; nunca el que mande el navegador.
  const precios = new Map((await servicios.preciosDe(items.map((i) => i.idProducto))).map((p) => [p.id, p]));
  const noDisponibles = items.filter((i) => !precios.get(i.idProducto)?.activo);
  if (noDisponibles.length > 0) {
    const nombres = noDisponibles.map((i) => precios.get(i.idProducto)?.nombre ?? `el producto ${i.idProducto}`);
    throw new ErrorApp(409, `Hay productos que ya no están disponibles: ${nombres.join(', ')}`);
  }
  const lineas = items.map((i) => {
    const p = precios.get(i.idProducto)!;
    return { idProducto: i.idProducto, nombre: p.nombre, cantidad: i.cantidad, precioUnitario: Number(p.precioVenta) };
  });
  const total = calcularTotal(lineas);

  // HU-21 · «Se reserva el stock al confirmar; si falta stock se informa qué
  // producto»: inventario responde 409 con lo que falta, y aquí no se creó nada.
  const idReserva = `pedido-${randomUUID()}`;
  await servicios.reservar(idReserva, items);

  const enLinea = requiereCobroEnLinea(datos.metodoPago);
  let pedido: PedidoConDetalle;
  try {
    pedido = await prisma.$transaction(async (tx: ClientePrisma) => {
      const idUbicacion = await ubicacionService.resolverDestino(tx, cliente.id, datos.ubicacion);
      return pedidoModel.crear(tx, {
        idUsuario: cliente.id,
        clienteNombre: cliente.nombre,
        idUbicacion,
        metodoPago: datos.metodoPago,
        // HU-26: el pagado en línea espera a la pasarela antes de entrar a la cocina.
        estadoPedido: enLinea ? 'Pendiente de pago' : 'Recibido',
        total,
        idReserva,
        lineas,
      });
    });
  } catch (e) {
    // Compensación: el pedido no llegó a existir, la reserva no tiene dueño.
    await servicios.liberar(idReserva).catch(() => undefined);
    throw e;
  }
  await avisarEstado(pedido, pedido.estado_pedido as EstadoPedido);

  const dto = aDetalleDTO(pedido);
  if (!enLinea) {
    dto.cobro = null;
    return dto;
  }

  // HU-26 · El cobro en línea (QR o tarjeta), con el modo vigente (HU-27).
  try {
    const cobro = await servicios.abrirCobro({
      idPedido: pedido.id_pedido,
      monto: total,
      metodo: datos.metodoPago,
      descripcion: `NutriExpress - Pedido ${pedido.id_pedido}`,
      cliente: { nombre: cliente.nombre },
    });
    await pedidoModel.registrarCobro(pedido.id_pedido, cobro.id);
    dto.cobro = cobro;
    return dto;
  } catch (e) {
    // Compensación: sin cobro el pedido no puede pagarse; se cancela y se libera el stock.
    if (await pedidoModel.cancelarSiEsta(pedido.id_pedido, ['Pendiente de pago'], 'Sin pago')) {
      await compensarCancelacion(pedido, 'Sin pago');
    }
    const motivo = e instanceof ErrorApp ? e.message : 'la pasarela no respondió';
    throw new ErrorApp(503, `No se pudo abrir el cobro en línea (${motivo}). Intente de nuevo o elija pagar en efectivo.`);
  }
}

/* ------------------------------------------------------------------ */
/* HU-25 · Mis pedidos, cancelar y seguir al repartidor                */
/* ------------------------------------------------------------------ */

/**
 * Si el aviso del cobro se perdió (RabbitMQ caído cuando ms-pagos lo publicó), el
 * pedido se pondría al día solo con el próximo evento. Mientras tanto se le
 * pregunta a ms-pagos al mirar un pedido que sigue esperando su pago, y se
 * aplica lo mismo que haría el evento.
 */
async function ponerAlDia(p: PedidoConDetalle): Promise<servicios.Cobro | null> {
  const cobro = p.metodo_pago === 'Efectivo' ? null : await servicios.cobroDe(p.id_pedido);
  if (p.estado_pedido === 'Pendiente de pago' && cobro) {
    if (cobro.estado === 'Pagado') await aplicarPago(p.id_pedido, cobro.referenciaExterna);
    else if (cobro.estado !== 'Pendiente') await aplicarFallo(p.id_pedido);
  }
  return cobro;
}

export async function listar(sesion: Sesion): Promise<PedidoDetalleDTO[]> {
  const cliente = exigirCliente(sesion, 'ver sus pedidos');
  let pedidos = await pedidoModel.listarDeCliente(cliente.id);
  const esperando = pedidos.filter((p) => p.estado_pedido === 'Pendiente de pago');
  if (esperando.length > 0) {
    await Promise.all(esperando.map(ponerAlDia));
    pedidos = await pedidoModel.listarDeCliente(cliente.id);
  }
  return pedidos.map(aDetalleDTO);
}

/** Un pedido propio, con su cobro: así se retoma un pago interrumpido (el QR sigue ahí). */
export async function detalle(sesion: Sesion, id: number): Promise<PedidoDetalleDTO> {
  const cliente = exigirCliente(sesion, 'ver sus pedidos');
  const pedido = await pedidoModel.buscarDeCliente(id, cliente.id);
  if (!pedido) throw new ErrorApp(404, 'El pedido no existe');
  const cobro = await ponerAlDia(pedido);
  const dto = aDetalleDTO((await pedidoModel.buscarPorId(id))!);
  dto.cobro = cobro;
  return dto;
}

/** HU-25 · «Cancelar libera el stock», mientras el pedido no haya salido a reparto. */
export async function cancelar(sesion: Sesion, id: number): Promise<PedidoDetalleDTO> {
  const cliente = exigirCliente(sesion, 'cancelar sus pedidos');
  const pedido = await pedidoModel.buscarDeCliente(id, cliente.id);
  if (!pedido) throw new ErrorApp(404, 'El pedido no existe');
  const estado = pedido.estado_pedido as EstadoPedido;
  if (!esCancelable(estado)) throw new ErrorApp(409, `No es posible cancelar un pedido en estado ${estado}`);

  if (!(await pedidoModel.cancelarSiEsta(id, ESTADOS_CANCELABLES, 'Cliente'))) {
    throw new ErrorApp(409, 'El pedido cambió de estado mientras tanto: vuelva a mirarlo');
  }
  await compensarCancelacion(pedido, 'Cliente');
  return detalle(sesion, id);
}

/** HU-25 · «La posición solo se ve con el pedido en camino.» */
export async function seguimiento(sesion: Sesion, id: number): Promise<SeguimientoDTO> {
  const cliente = exigirCliente(sesion, 'seguir sus pedidos');
  const pedido = await pedidoModel.buscarDeCliente(id, cliente.id);
  if (!pedido) throw new ErrorApp(404, 'El pedido no existe');
  if (pedido.estado_pedido !== 'En camino' || pedido.id_repartidor === null) {
    return { enCamino: false, repartidor: null, posicion: null };
  }
  const posicion = await posicionModel.buscar(pedido.id_repartidor);
  return {
    enCamino: true,
    // Solo el nombre de pila: al cliente no le hace falta más.
    repartidor: pedido.repartidor_nombre?.split(' ')[0] ?? null,
    posicion: posicion && {
      latitud: Number(posicion.latitud),
      longitud: Number(posicion.longitud),
      precision: posicion.precision_m === null ? null : Number(posicion.precision_m),
      actualizadaEn: posicion.actualizada_en.toISOString(),
      antiguedadSegundos: Math.max(0, Math.round((Date.now() - posicion.actualizada_en.getTime()) / 1000)),
    },
  };
}

/**
 * El comprobante del pedido pagado en línea: la constancia de un pago, así que
 * existe solo con el pago confirmado. El PDF y el envío por correo llegan con
 * ms-reportes (HU-32, Sprint 6).
 */
export async function comprobante(sesion: Sesion, id: number): Promise<ComprobantePedidoDTO> {
  const cliente = exigirCliente(sesion, 'ver sus comprobantes');
  const encontrado = await pedidoModel.buscarDeCliente(id, cliente.id);
  if (!encontrado) throw new ErrorApp(404, 'El pedido no existe');
  const cobro = await ponerAlDia(encontrado);
  const p = (await pedidoModel.buscarPorId(id))!;
  if (p.estado_pago !== 'Pagado') throw new ErrorApp(409, 'El comprobante existe una vez confirmado el pago');

  const d = aDetalleDTO(p);
  const u = p.ubicacion;
  return {
    numero: `Pedido #${String(p.id_pedido).padStart(5, '0')}`,
    fecha: d.fecha,
    pagadoEn: cobro?.confirmadoEn ?? null,
    cliente: p.cliente_nombre,
    entrega: [u.calle, u.numero, u.referencia].filter(Boolean).join(', '),
    metodoPago: d.metodoPago,
    referenciaPago: p.referencia_pago,
    detalle: d.items,
    cantidadItems: d.items.reduce((t, l) => t + l.cantidad, 0),
    total: d.total,
    soporte: process.env.CORREO_SOPORTE ?? 'soporte@nutriexpress.bo',
  };
}

/* ------------------------------------------------------------------ */
/* HU-26 · Desenlace del cobro (eventos de ms-pagos)                   */
/* ------------------------------------------------------------------ */

interface DatosDesenlace {
  idPedido: number | null;
  referenciaExterna: string | null;
}

/** PagoConfirmado: el pedido entra a la cocina. Idempotente: si ya salió de «Pendiente de pago», no hace nada. */
async function aplicarPago(idPedido: number, referencia: string | null): Promise<void> {
  if (!(await pedidoModel.marcarPagado(idPedido, referencia))) return;
  const p = await pedidoModel.buscarPorId(idPedido);
  if (p) await avisarEstado(p, 'Recibido');
}

/** PagoFallido (vencido o anulado): el pedido se cancela y se libera su stock. */
async function aplicarFallo(idPedido: number): Promise<void> {
  if (!(await pedidoModel.cancelarSiEsta(idPedido, ['Pendiente de pago'], 'Sin pago', 'Vencido'))) return;
  const p = await pedidoModel.buscarPorId(idPedido);
  if (p) await compensarCancelacion(p, 'Sin pago');
}

export async function pagoConfirmado(evento: Evento<DatosDesenlace>): Promise<void> {
  // Los cobros de ventas de mostrador (Sprint 5) no son de este servicio.
  if (evento.datos.idPedido === null) return;
  await aplicarPago(evento.datos.idPedido, evento.datos.referenciaExterna);
}

export async function pagoFallido(evento: Evento<DatosDesenlace>): Promise<void> {
  if (evento.datos.idPedido === null) return;
  await aplicarFallo(evento.datos.idPedido);
}
