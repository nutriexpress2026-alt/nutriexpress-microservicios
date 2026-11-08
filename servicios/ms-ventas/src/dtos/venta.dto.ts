import { z } from 'zod';
import { camposDeFecha, camposDePagina } from './paginacion.dto.js';
import { METODOS_PAGO_VENTA, TIPOS_VENTA, type EstadoPagoVenta, type MetodoPagoVenta, type TipoVenta } from '../config/dominio.js';
import type { Cobro } from '../clientes/servicios.js';

/** HU-18, HU-19 · Lo que entra a ms-ventas, validado en el servidor (RNF-SEG-06). Adaptado del sistema anterior. */

const esquemaLinea = z.object({
  idProducto: z.number().int().positive(),
  cantidad: z.number().int().gt(0, 'la cantidad debe ser mayor a cero').max(1000),
});
const esquemaItems = z.array(esquemaLinea).min(1, 'la venta debe contener al menos un producto').max(50);

/** El precio no viaja en el cuerpo: lo pone el sistema (RF-VEN-03). */
export const esquemaCrearVenta = z.object({
  tipoVenta: z.enum(TIPOS_VENTA).default('Mesa'),
  metodoPago: z.enum(METODOS_PAGO_VENTA, { error: 'en el mostrador se cobra en efectivo o con QR: no hay terminal para tarjeta' }),
  idCliente: z.number().int().positive().nullable().optional(),
  items: esquemaItems,
});

export const esquemaEvaluarVenta = z.object({ items: esquemaItems });

export const esquemaAnularVenta = z.object({
  motivo: z.string().trim().min(4, 'indique el motivo de la anulación').max(200),
});

export const esquemaFiltroVentas = z.object({
  tipo: z.enum(TIPOS_VENTA).optional(),
  cliente: z.coerce.number().int().positive().optional(),
  ...camposDeFecha,
  ...camposDePagina,
});

export type DatosCrearVenta = z.infer<typeof esquemaCrearVenta>;

/* Respuestas: la forma del sistema anterior, que es la que espera el frontend. */

export interface LineaVentaDTO {
  idProducto: number;
  nombre: string;
  almacen: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface VentaDTO {
  id: number;
  fecha: string;
  tipoVenta: TipoVenta;
  metodoPago: MetodoPagoVenta;
  estadoPago: EstadoPagoVenta;
  total: number;
  cliente: { id: number; nombreCompleto: string } | null;
  atendidoPor: { id: number; nombreCompleto: string };
  items: LineaVentaDTO[];
  cobro?: Cobro | null;
}

export interface AnulacionVentaDTO {
  venta: VentaDTO;
  requiereDevolucion: boolean;
  aviso?: string;
}

export interface ComprobanteDTO {
  numero: string;
  fecha: string;
  tipoVenta: TipoVenta;
  metodoPago: MetodoPagoVenta;
  cliente: string;
  atendidoPor: string;
  detalle: LineaVentaDTO[];
  cantidadItems: number;
  total: number;
}
