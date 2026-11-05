import { prisma } from '../config/prisma.js';
import type { AlmacenDeVigencias } from '../middlewares/sesiones-vigentes.js';

/**
 * Capa Model — desde cuándo valen las sesiones de un usuario o de un rol, tras
 * un cambio de permisos (tabla sesion_vigente, HU-05).
 *
 * Leer y después escribir es seguro aquí: los eventos se atienden de a uno.
 */
export const almacenDeVigencias: AlmacenDeVigencias = {
  todas: () => prisma.sesion_vigente.findMany(),
  async guardar(clave: string, desde: Date) {
    const actual = await prisma.sesion_vigente.findUnique({ where: { clave } });
    if (actual && actual.desde >= desde) return;
    await prisma.sesion_vigente.upsert({ where: { clave }, create: { clave, desde }, update: { desde } });
  },
};
