import { prisma } from '../config/prisma.js';

/** Capa Model — tabla `configuracion`: el modo de cobro que el administrador cambia en caliente (HU-27). */

export const buscar = (clave: string) => prisma.configuracion.findUnique({ where: { clave } });

/**
 * Escribe el valor dejando constancia de quién y cuándo. El nombre se guarda
 * tal como venía en el token: el usuario vive en ms-identidad (RNF-ARQ-02).
 */
export const guardar = (clave: string, valor: string, actualizadoPor: string) =>
  prisma.configuracion.upsert({
    where: { clave },
    update: { valor, actualizado_por: actualizadoPor, actualizado_en: new Date() },
    create: { clave, valor, actualizado_por: actualizadoPor },
  });
