import { prisma } from '../config/prisma.js';

/** Capa Model — códigos de «olvidé mi contraseña» (tabla recuperacion_contrasena, HU-06). */

export const crear = (idUsuario: number, codigoHash: string, expiraEn: Date) =>
  prisma.recuperacion_contrasena.create({
    data: { id_usuario: idUsuario, codigo_hash: codigoHash, expira_en: expiraEn },
  });

/**
 * El último código que se pidió para la cuenta, usado o no, venza o no. Solo
 * vale el último: pedir uno nuevo deja sin efecto los anteriores, y usar el
 * último no revive a los de antes.
 */
export const ultimo = (idUsuario: number) =>
  prisma.recuperacion_contrasena.findFirst({
    where: { id_usuario: idUsuario },
    orderBy: [{ creado_en: 'desc' }, { id_recuperacion: 'desc' }],
  });

/** Suma un intento fallido y devuelve cuántos lleva. */
export const sumarIntento = async (idRecuperacion: number) =>
  (
    await prisma.recuperacion_contrasena.update({
      where: { id_recuperacion: idRecuperacion },
      data: { intentos: { increment: 1 } },
      select: { intentos: true },
    })
  ).intentos;

/**
 * Cambia la contraseña con un código válido, en una sola transacción: la
 * contraseña nueva, el desbloqueo de la cuenta y el código marcado como usado
 * son el mismo hecho.
 *
 * El código se marca **solo si seguía sin usar**: si llegan dos pedidos a la
 * vez con el mismo código, uno gana y el otro recibe `false` sin tocar la
 * contraseña. Así el código sirve una sola vez.
 *
 * Desbloquea y reinicia la escalada del bloqueo (como el desbloqueo del
 * administrador): quien recibe el código en su correo demostró ser el dueño. Es
 * la salida del administrador bloqueado, que no tiene a nadie por encima.
 */
export const restablecer = (idRecuperacion: number, idUsuario: number, contrasenaHash: string) =>
  prisma.$transaction(async (tx) => {
    const marcado = await tx.recuperacion_contrasena.updateMany({
      where: { id_recuperacion: idRecuperacion, usado_en: null },
      data: { usado_en: new Date() },
    });
    if (marcado.count === 0) return false;
    await tx.usuario.update({
      where: { id_usuario: idUsuario },
      data: {
        contrasena_hash: contrasenaHash,
        bloqueado: false,
        fecha_bloqueo: null,
        intentos_fallidos: 0,
        veces_bloqueado: 0,
      },
      select: { id_usuario: true },
    });
    return true;
  });
