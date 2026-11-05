import { prisma } from '../config/prisma.js';

/**
 * Capa Model — tabla `posicion_repartidor` (HU-25). Aquí solo se lee: la escribe
 * el repartidor desde «Mis entregas» (HU-24, Sprint 5).
 */
export const buscar = (idEmpleado: number) => prisma.posicion_repartidor.findUnique({ where: { id_empleado: idEmpleado } });
