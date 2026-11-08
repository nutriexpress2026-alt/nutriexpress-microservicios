import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from './pedido.model.js';

/**
 * Capa Model — `turno_repartidor` y `posicion_repartidor` (HU-24): si el
 * repartidor está de turno, y dónde está mientras lleva un pedido en camino.
 */

export const turnos = () => prisma.turno_repartidor.findMany();

export const disponibilidad = async (idEmpleado: number) =>
  (await prisma.turno_repartidor.findUnique({ where: { id_empleado: idEmpleado } }))?.disponible ?? false;

export const cambiarDisponibilidad = (idEmpleado: number, disponible: boolean) =>
  prisma.turno_repartidor.upsert({
    where: { id_empleado: idEmpleado },
    create: { id_empleado: idEmpleado, disponible },
    update: { disponible, actualizado_en: new Date() },
  });

export const guardarPosicion = (idEmpleado: number, p: { latitud: number; longitud: number; precision: number | null }) =>
  prisma.posicion_repartidor.upsert({
    where: { id_empleado: idEmpleado },
    create: { id_empleado: idEmpleado, latitud: p.latitud, longitud: p.longitud, precision_m: p.precision },
    update: { latitud: p.latitud, longitud: p.longitud, precision_m: p.precision, actualizada_en: new Date() },
  });

export const borrarPosicion = (idEmpleado: number, tx: ClientePrisma = prisma) =>
  tx.posicion_repartidor.deleteMany({ where: { id_empleado: idEmpleado } });
