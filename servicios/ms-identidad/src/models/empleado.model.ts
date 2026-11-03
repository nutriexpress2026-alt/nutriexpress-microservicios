import { prisma } from '../config/prisma.js';

/** Capa Model — clase de análisis tblEmpleado (especialización de Usuario). */

const CON_CARGO_Y_USUARIO = {
  id_empleado: true,
  cargo: { select: { nombre: true } },
  usuario: { select: { nombre: true, apellido: true, activo: true } },
} as const;

export const buscarPorId = (idEmpleado: number) =>
  prisma.empleado.findUnique({
    where: { id_empleado: idEmpleado },
    select: CON_CARGO_Y_USUARIO,
  });

/** Personal activo de un cargo determinado, p. ej. los repartidores. */
export const listarPorCargo = (nombreCargo: string) =>
  prisma.empleado.findMany({
    where: { cargo: { nombre: nombreCargo }, usuario: { activo: true } },
    select: CON_CARGO_Y_USUARIO,
    orderBy: { usuario: { apellido: 'asc' } },
  });

/** Turno actual del empleado (RF-PED-07). */
export const obtenerDisponibilidad = (idEmpleado: number) =>
  prisma.empleado.findUniqueOrThrow({
    where: { id_empleado: idEmpleado },
    select: { disponible: true },
  });

/** Marca al empleado de turno o fuera de turno (RF-PED-07). */
export const cambiarDisponibilidad = (idEmpleado: number, disponible: boolean) =>
  prisma.empleado.update({
    where: { id_empleado: idEmpleado },
    data: { disponible },
    select: { id_empleado: true, disponible: true },
  });

// La carga de cada repartidor (sus pedidos en curso) la calcula ms-pedidos,
// que es el dueño de los pedidos (Sprint 4).

export type EmpleadoConCargo = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;
