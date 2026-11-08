import { suscribir } from './config/eventos.js';
import { permisosCambiados } from './middlewares/sesiones-vigentes.js';
import { pagoConfirmado, pagoFallido } from './services/venta.service.js';

/**
 * Los eventos que consume ms-ventas y quién atiende cada uno (catálogo de
 * eventos, sección 3.1.7). Se llama al arrancar, antes de conectar.
 */
export function registrarSuscripciones(): void {
  suscribir('PermisosCambiados', permisosCambiados);
  // HU-18: el desenlace del cobro con QR de una venta, que publica ms-pagos.
  suscribir('PagoConfirmado', pagoConfirmado);
  suscribir('PagoFallido', pagoFallido);
}
