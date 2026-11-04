import { suscribir } from './config/eventos.js';
import { permisosCambiados } from './middlewares/sesiones-vigentes.js';
import { insumoEliminado, insumoGuardado } from './services/replica.service.js';

/**
 * Los eventos que consume ms-catalogo y quién atiende cada uno (catálogo de
 * eventos, sección 3.1.7). Se llama al arrancar, antes de conectar.
 */
export function registrarSuscripciones(): void {
  suscribir('PermisosCambiados', permisosCambiados);
  suscribir('InsumoGuardado', insumoGuardado);
  suscribir('InsumoEliminado', insumoEliminado);
}
