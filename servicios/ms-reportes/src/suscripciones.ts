import { suscribir } from './config/eventos.js';
import { enviarCodigoRecuperacion } from './services/correo.service.js';
import { pedidoEstadoCambiado, ventaRegistrada } from './services/proyeccion.service.js';
import { permisosCambiados } from './middlewares/sesiones-vigentes.js';

/**
 * Los eventos que consume ms-reportes y quién atiende cada uno (catálogo de
 * eventos, sección 3.1.7). Se llama al arrancar, antes de conectar.
 */
export function registrarSuscripciones(): void {
  suscribir('CodigoRecuperacionGenerado', enviarCodigoRecuperacion);
  // Sprint 6 · La copia de ventas y pedidos para los reportes (HU-28, HU-29) y los avisos al cliente (HU-32).
  suscribir('VentaRegistrada', ventaRegistrada);
  suscribir('PedidoEstadoCambiado', pedidoEstadoCambiado);
  // HU-05 · Los reportes también exigen sesiones vigentes.
  suscribir('PermisosCambiados', permisosCambiados);
}
