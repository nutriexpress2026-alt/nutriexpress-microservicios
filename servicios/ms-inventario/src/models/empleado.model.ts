import { prisma } from '../config/prisma.js';

/**
 * Réplica de los empleados (RNF-ARQ-02): id, nombre y apellido, tomados del
 * token de quien opera. Sirve para mostrar quién registró cada nota sin
 * consultar a ms-identidad.
 */
export const guardar = (id: number, nombre: string, apellido: string) =>
  prisma.empleado.upsert({
    where: { id_empleado: id },
    update: { nombre, apellido },
    create: { id_empleado: id, nombre, apellido },
  });

export const existe = async (id: number) =>
  (await prisma.empleado.count({ where: { id_empleado: id } })) > 0;
