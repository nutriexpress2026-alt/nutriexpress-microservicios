import { suscribir } from './config/eventos.js';
import { permisosCambiados } from './middlewares/sesiones-vigentes.js';
import { cerrarPorPedidoCancelado } from './services/pago.service.js';

/**
 * Los eventos que consume ms-pagos y quién atiende cada uno (catálogo de
 * eventos, sección 3.1.7). Se llama al arrancar, antes de conectar.
 */
export function registrarSuscripciones(): void {
  suscribir('PermisosCambiados', permisosCambiados);
  // HU-25: el cliente canceló un pedido que todavía no había pagado.
  suscribir('PedidoCancelado', (evento) => cerrarPorPedidoCancelado((evento.datos as { idPedido: number }).idPedido));
}
