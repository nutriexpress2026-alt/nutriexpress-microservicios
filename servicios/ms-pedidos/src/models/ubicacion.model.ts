import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from './pedido.model.js';

/** Capa Model — tabla `ubicacion`: direcciones de entrega de cada cliente (HU-22). */

export type UbicacionConsultada = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;

export const buscarPorId = (id: number, tx: ClientePrisma = prisma) =>
  tx.ubicacion.findUnique({ where: { id_ubicacion: id } });

/** Las vigentes del cliente, la principal primero: es la que el carrito ofrece elegida. */
export const listarDeCliente = (idUsuario: number) =>
  prisma.ubicacion.findMany({
    where: { id_usuario: idUsuario, vigente: true },
    orderBy: [{ principal: 'desc' }, { fecha_registro: 'desc' }],
  });

export const contarVigentes = (idUsuario: number) =>
  prisma.ubicacion.count({ where: { id_usuario: idUsuario, vigente: true } });

export const crear = (
  tx: ClientePrisma,
  datos: {
    calle: string;
    numero: string | null;
    referencia: string;
    latitud: number | null;
    longitud: number | null;
    etiqueta: string | null;
    idUsuario: number | null;
    principal?: boolean;
  },
) =>
  tx.ubicacion.create({
    data: {
      calle: datos.calle,
      numero: datos.numero,
      referencia: datos.referencia,
      latitud: datos.latitud,
      longitud: datos.longitud,
      etiqueta: datos.etiqueta,
      id_usuario: datos.idUsuario,
      principal: datos.principal ?? false,
    },
  });

/** Deja de ofrecerse; los pedidos que la usaron la conservan tal como era. */
export const archivar = (id: number, tx: ClientePrisma = prisma) =>
  tx.ubicacion.update({ where: { id_ubicacion: id }, data: { vigente: false, principal: false } });

/** HU-22 · Una sola principal por cliente: se quita la anterior y se marca esta. */
export async function marcarPrincipal(tx: ClientePrisma, idUsuario: number, id: number) {
  await tx.ubicacion.updateMany({ where: { id_usuario: idUsuario, principal: true }, data: { principal: false } });
  return tx.ubicacion.update({ where: { id_ubicacion: id }, data: { principal: true } });
}
