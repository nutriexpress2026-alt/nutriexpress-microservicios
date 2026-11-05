import { prisma } from '../config/prisma.js';
import * as ubicacionModel from '../models/ubicacion.model.js';
import type { UbicacionConsultada } from '../models/ubicacion.model.js';
import type { ClientePrisma } from '../models/pedido.model.js';
import type { DatosCrearUbicacion, DatosDestinoPedido, UbicacionDTO } from '../dtos/ubicacion.dto.js';
import { exigirCliente } from './cliente.service.js';
import type { Sesion } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * HU-22 · Direcciones de entrega del cliente (adaptado del sistema anterior).
 *
 * Criterios de aceptación: coordenadas con seis decimales (las redondea el DTO)
 * y una dirección puede quedar como principal, que es la que el carrito ofrece
 * elegida. Corregir una dirección no la sobrescribe: se archiva y se crea otra,
 * para que los pedidos que la usaron conserven a dónde se entregaron.
 */

/** Más direcciones no ayudan a nadie a elegir y abren la puerta a llenar la base. */
const MAXIMO_DIRECCIONES = 10;

function aDTO(u: UbicacionConsultada): UbicacionDTO {
  return {
    id: u.id_ubicacion,
    etiqueta: u.etiqueta,
    calle: u.calle,
    numero: u.numero,
    referencia: u.referencia ?? '',
    latitud: u.latitud === null ? null : Number(u.latitud),
    longitud: u.longitud === null ? null : Number(u.longitud),
    principal: u.principal,
    vigente: u.vigente,
  };
}

async function exigirPropia(id: number, idUsuario: number, tx: ClientePrisma = prisma) {
  const ubicacion = await ubicacionModel.buscarPorId(id, tx);
  // Una ajena se responde como inexistente: no se confirma que exista.
  if (!ubicacion || ubicacion.id_usuario !== idUsuario || !ubicacion.vigente) {
    throw new ErrorApp(404, 'La dirección no existe');
  }
  return ubicacion;
}

export async function listar(sesion: Sesion): Promise<UbicacionDTO[]> {
  const cliente = exigirCliente(sesion, 'administrar sus direcciones');
  return (await ubicacionModel.listarDeCliente(cliente.id)).map(aDTO);
}

export async function crear(sesion: Sesion, datos: DatosCrearUbicacion): Promise<UbicacionDTO> {
  const cliente = exigirCliente(sesion, 'administrar sus direcciones');
  const cuantas = await ubicacionModel.contarVigentes(cliente.id);
  if (cuantas >= MAXIMO_DIRECCIONES) {
    throw new ErrorApp(409, `Ya tiene ${MAXIMO_DIRECCIONES} direcciones guardadas. Elimine alguna para agregar otra.`);
  }
  return prisma.$transaction(async (tx: ClientePrisma) => {
    const creada = await ubicacionModel.crear(tx, {
      calle: datos.calle,
      numero: datos.numero ?? null,
      referencia: datos.referencia,
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
      etiqueta: datos.etiqueta,
      idUsuario: cliente.id,
    });
    // La primera dirección es la principal: no hay otra que ofrecer primero.
    const principal = datos.principal || cuantas === 0;
    return aDTO(principal ? await ubicacionModel.marcarPrincipal(tx, cliente.id, creada.id_ubicacion) : creada);
  });
}

export async function reemplazar(sesion: Sesion, id: number, datos: DatosCrearUbicacion): Promise<UbicacionDTO> {
  const cliente = exigirCliente(sesion, 'administrar sus direcciones');
  return prisma.$transaction(async (tx: ClientePrisma) => {
    const anterior = await exigirPropia(id, cliente.id, tx);
    await ubicacionModel.archivar(id, tx);
    const nueva = await ubicacionModel.crear(tx, {
      calle: datos.calle,
      numero: datos.numero ?? null,
      referencia: datos.referencia,
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
      etiqueta: datos.etiqueta,
      idUsuario: cliente.id,
    });
    // La corregida hereda ser la principal, salvo que se diga otra cosa.
    const principal = datos.principal ?? anterior.principal;
    return aDTO(principal ? await ubicacionModel.marcarPrincipal(tx, cliente.id, nueva.id_ubicacion) : nueva);
  });
}

/** HU-22 · «Una dirección puede quedar como principal.» */
export async function marcarPrincipal(sesion: Sesion, id: number): Promise<UbicacionDTO> {
  const cliente = exigirCliente(sesion, 'administrar sus direcciones');
  return prisma.$transaction(async (tx: ClientePrisma) => {
    await exigirPropia(id, cliente.id, tx);
    return aDTO(await ubicacionModel.marcarPrincipal(tx, cliente.id, id));
  });
}

export async function eliminar(sesion: Sesion, id: number): Promise<void> {
  const cliente = exigirCliente(sesion, 'administrar sus direcciones');
  await exigirPropia(id, cliente.id);
  await ubicacionModel.archivar(id);
}

/**
 * El destino de un pedido: una guardada del cliente, o la escrita en el momento.
 * La escrita queda guardada solo si trae etiqueta; si no, es de ese pedido.
 */
export async function resolverDestino(tx: ClientePrisma, idUsuario: number, destino: DatosDestinoPedido): Promise<number> {
  if (destino.idUbicacion !== undefined) {
    const guardada = await ubicacionModel.buscarPorId(destino.idUbicacion, tx);
    if (!guardada || guardada.id_usuario !== idUsuario) throw new ErrorApp(404, 'La dirección no existe');
    if (!guardada.vigente) throw new ErrorApp(409, 'Esa dirección fue reemplazada. Elija otra.');
    return guardada.id_ubicacion;
  }
  if (!destino.calle || !destino.referencia) throw new ErrorApp(400, 'La dirección necesita calle y referencia');

  const guardar = Boolean(destino.etiqueta);
  const creada = await ubicacionModel.crear(tx, {
    calle: destino.calle,
    numero: destino.numero ?? null,
    referencia: destino.referencia,
    latitud: destino.latitud ?? null,
    longitud: destino.longitud ?? null,
    etiqueta: destino.etiqueta ?? null,
    idUsuario: guardar ? idUsuario : null,
  });
  return creada.id_ubicacion;
}
