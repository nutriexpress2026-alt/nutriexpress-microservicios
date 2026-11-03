import { prisma } from '../config/prisma.js';

/**
 * Capa Model — tabla `configuracion` de ms-catalogo: los datos públicos del
 * negocio (claves NEGOCIO_*), que el administrador cambia en caliente. El
 * modo de cobro vive en ms-pagos (Sprint 4).
 */

export const buscar = (clave: string) => prisma.configuracion.findUnique({ where: { clave } });

export const listar = () => prisma.configuracion.findMany({ orderBy: { clave: 'asc' } });

/**
 * Escribe el valor dejando constancia de quién (el id del token) y cuándo.
 * `upsert`: una instalación puede no tener todavía la fila.
 */
export const guardar = (clave: string, valor: string, idUsuario: number, descripcion?: string) =>
  prisma.configuracion.upsert({
    where: { clave },
    update: { valor, id_usuario: idUsuario, actualizado_en: new Date() },
    create: { clave, valor, descripcion, id_usuario: idUsuario },
  });

export type ConfiguracionConsultada = Awaited<ReturnType<typeof listar>>[number];
