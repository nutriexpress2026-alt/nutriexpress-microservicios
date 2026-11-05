import { z } from 'zod';
import { ESTADOS_PAGO, METODOS_PAGO, MODOS_COBRO } from '../config/dominio.js';

/** HU-26, HU-27 · Lo que entra a ms-pagos, validado en el servidor (RNF-SEG-06). */

export const esquemaFiltroPagos = z.object({
  estado: z.enum(ESTADOS_PAGO).optional(),
  modo: z.enum(MODOS_COBRO).optional(),
});

/** Un solo campo a propósito: activar el dinero real es una decisión, no un ajuste más. */
export const esquemaCambiarModo = z.object({ modo: z.enum(MODOS_COBRO) });

/** Lo que pide ms-pedidos (o ms-ventas, Sprint 5) por REST interno. */
export const esquemaSolicitudCobro = z.object({
  idPedido: z.number().int().positive().optional(),
  idVenta: z.number().int().positive().optional(),
  monto: z.number().positive().max(1_000_000),
  metodo: z.enum(METODOS_PAGO),
  descripcion: z.string().trim().min(1).max(120),
  cliente: z
    .object({ nombre: z.string().trim().min(1).max(120), email: z.string().email().optional() })
    .optional(),
});
