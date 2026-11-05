import { suscribir } from './config/eventos.js';
import { permisosCambiados } from './middlewares/sesiones-vigentes.js';
import { productoGuardado } from './services/replica.service.js';
import { ordenFinalizada } from './services/produccion.service.js';
import { pedidoCancelado } from './services/reserva.service.js';

/**
 * Los eventos que consume ms-inventario y quién atiende cada uno (catálogo de
 * eventos, sección 3.1.7). Se llama al arrancar, antes de conectar.
 */
export function registrarSuscripciones(): void {
  suscribir('PermisosCambiados', permisosCambiados);
  suscribir('ProductoGuardado', productoGuardado);
  suscribir('OrdenFinalizada', ordenFinalizada);
  // HU-25, HU-26: el pedido se canceló (el cliente, o venció su pago): su reserva vuelve al disponible.
  suscribir('PedidoCancelado', pedidoCancelado);
}
