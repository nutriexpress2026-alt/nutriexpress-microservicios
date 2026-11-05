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

/** Lo que viaja en `PermisosCambiados`: de quién (un usuario o todos los de un rol) y desde cuándo. */
export type DatosPermisosCambiados = ({ idUsuario: number } | { idRol: number }) & { desde: string };

/**
 * HU-05 · «El cambio rige en la siguiente petición» también fuera de ms-identidad.
 *
 * Los demás servicios autorizan con los permisos que trae el token, que dura
 * horas. Con este evento cada uno anota desde cuándo valen las sesiones de ese
 * usuario o rol, y rechaza los tokens anteriores: quien los tenía vuelve a
 * entrar y recibe uno con sus permisos de ahora.
 *
 * `desde` va redondeado **hacia abajo** al segundo, porque el `iat` del token
 * está en segundos: así quien vuelve a entrar en el mismo segundo del cambio no
 * recibe otro rechazo.
 */
export function avisarPermisosCambiados(quien: { idUsuario: number } | { idRol: number }): Promise<void> {
  const desde = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  return avisar<DatosPermisosCambiados>('PermisosCambiados', { ...quien, desde });
}
