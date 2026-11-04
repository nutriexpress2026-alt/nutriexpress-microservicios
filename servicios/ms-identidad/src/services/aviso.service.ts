import { publicar } from '../config/eventos.js';

/**
 * Publica un evento sin que un RabbitMQ caído tumbe la operación que lo
 * originó (RNF-DIS-01): lo que se guardó en la base queda guardado, y el error
 * se registra para revisarlo. Nunca se registra el contenido del evento, que
 * puede traer datos sensibles (un código de recuperación, por ejemplo).
 */
export async function avisar<D>(tipo: string, datos: D): Promise<void> {
  try {
    await publicar(tipo, datos);
  } catch (e) {
    console.error(`ms-identidad: no se pudo publicar ${tipo} (${(e as Error).message})`);
  }
}
