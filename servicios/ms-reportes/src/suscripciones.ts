import { suscribir } from './config/eventos.js';
import { enviarCodigoRecuperacion } from './services/correo.service.js';

/**
 * Los eventos que consume ms-reportes y quién atiende cada uno (catálogo de
 * eventos, sección 3.1.7). Se llama al arrancar, antes de conectar.
 */
export function registrarSuscripciones(): void {
  suscribir('CodigoRecuperacionGenerado', enviarCodigoRecuperacion);
}
