import { z } from 'zod';
import { esquemaDestinoPedido } from './ubicacion.dto.js';
import { METODOS_PAGO, type EstadoPedido, type MetodoPago, type MotivoCancelacion } from '../config/dominio.js';
import type { Cobro } from '../clientes/servicios.js';

/**
 * HU-21 · Confirmar el carrito.
 *
 * El precio no viaja en el cuerpo: lo fija el servidor con el catálogo al
 * confirmar (RNF-SEG-03). Aceptarlo del navegador permitiría alterar el total.
 */
const esquemaLinea = z.object({
  idProducto: z.number().int().positive(),
  cantidad: z.number().int().positive().max(100),
});

export const esquemaConfirmarPedido = z.object({
  metodoPago: z.enum(METODOS_PAGO),
  ubicacion: esquemaDestinoPedido,
  items: z.array(esquemaLinea).min(1).max(50),
});

export type DatosConfirmarPedido = z.infer<typeof esquemaConfirmarPedido>;

/* Respuestas: la misma forma que en el sistema anterior, que es la que espera el frontend. */

export interface UbicacionEntregaDTO {
  calle: string;
  numero: string | null;
  referencia: string | null;
  latitud: number | null;
  longitud: number | null;
}

export interface LineaPedidoDTO {
  idProducto: number;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PedidoDetalleDTO {
  id: number;
  fecha: string;
  estadoPedido: EstadoPedido;
  estadoPago: string;
  metodoPago: MetodoPago;
  total: number;
  fechaEntrega: string | null;
  cancelable: boolean;
  motivoCancelacion: MotivoCancelacion | null;
  referenciaPago: string | null;
  /** HU-26 · El cobro en línea: trae el QR o el enlace que el cliente debe usar. */
  cobro?: Cobro | null;
  ubicacion: UbicacionEntregaDTO;
  items: LineaPedidoDTO[];
}

/** HU-25 · Dónde viene el repartidor, solo mientras el pedido está en camino. */
export interface SeguimientoDTO {
  enCamino: boolean;
  repartidor: string | null;
  posicion: {
    latitud: number;
    longitud: number;
    precision: number | null;
    actualizadaEn: string;
    antiguedadSegundos: number;
  } | null;
}

/** El comprobante del pedido pagado (RF-VEN-06 llevado al pedido). */
export interface ComprobantePedidoDTO {
  numero: string;
  fecha: string;
  pagadoEn: string | null;
  cliente: string;
  entrega: string;
  metodoPago: MetodoPago;
  referenciaPago: string | null;
  detalle: LineaPedidoDTO[];
  cantidadItems: number;
  total: number;
  soporte: string;
}
