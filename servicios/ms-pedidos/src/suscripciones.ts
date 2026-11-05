import { suscribir } from './config/eventos.js';
import { permisosCambiados } from './middlewares/sesiones-vigentes.js';
import { pagoConfirmado, pagoFallido } from './services/pedido.service.js';

/**
 * Los eventos que consume ms-pedidos y quién atiende cada uno (catálogo de
 * eventos, sección 3.1.7). Se llama al arrancar, antes de conectar.
 */
export function registrarSuscripciones(): void {
  suscribir('PermisosCambiados', permisosCambiados);
  // HU-26: el desenlace del cobro en línea, que publica ms-pagos.
  suscribir('PagoConfirmado', pagoConfirmado);
  suscribir('PagoFallido', pagoFallido);
}
