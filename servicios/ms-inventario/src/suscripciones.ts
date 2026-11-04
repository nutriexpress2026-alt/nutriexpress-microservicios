import { suscribir } from './config/eventos.js';
import { permisosCambiados } from './middlewares/sesiones-vigentes.js';
import { productoGuardado } from './services/replica.service.js';
import { ordenFinalizada } from './services/produccion.service.js';

/**
 * Los eventos que consume ms-inventario y quién atiende cada uno (catálogo de
 * eventos, sección 3.1.7). Se llama al arrancar, antes de conectar.
 */
export function registrarSuscripciones(): void {
  suscribir('PermisosCambiados', permisosCambiados);
  suscribir('ProductoGuardado', productoGuardado);
  suscribir('OrdenFinalizada', ordenFinalizada);
}
