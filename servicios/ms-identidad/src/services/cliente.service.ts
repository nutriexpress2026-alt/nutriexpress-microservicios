import * as clienteModel from '../models/cliente.model.js';
import * as usuarioModel from '../models/usuario.model.js';
import { pagina, type Pagina } from '../dtos/paginacion.dto.js';
import type { ClienteConsultado } from '../models/cliente.model.js';
import type { ClienteDTO, DatosActualizarCliente, FiltroClientesDTO } from '../dtos/cliente.dto.js';
import { exigirEmpleado } from './actor.service.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * HU-20 · Gestionar clientes (RF-VEN-01), adaptado del sistema anterior.
 *
 * Los datos del cliente son de ms-identidad desde el Sprint 1 (tablas usuario y
 * cliente): aquí se consultan y se editan, y ms-ventas y ms-pedidos guardan solo
 * su número (RNF-ARQ-02). Criterios: el correo no se repite; la búsqueda no
 * distingue tildes (`clienteModel.idsQueCoinciden`).
 *
 * Cuántos pedidos y ventas tiene cada uno lo saben ms-pedidos y ms-ventas: se les
 * pregunta por REST interno, y si no responden se muestra 0 (RNF-DIS-01).
 */

const ACCION = 'gestionar las fichas de clientes';
const PEDIDOS_URL = process.env.PEDIDOS_URL ?? 'http://ms-pedidos:4004';
const VENTAS_URL = process.env.VENTAS_URL ?? 'http://ms-ventas:4006';

/** Cuántos tiene cada cliente en otro servicio ({ "5": 3 }), o vacío si no respondió. */
async function conteos(url: string, ids: number[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  try {
    const r = await fetch(`${url}?clientes=${ids.join(',')}`, { signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function aDTO(c: ClienteConsultado, pedidos: Record<string, number>, ventas: Record<string, number>): ClienteDTO {
  return {
    id: c.id_cliente,
    nombre: c.usuario.nombre,
    apellido: c.usuario.apellido,
    nombreCompleto: `${c.usuario.nombre} ${c.usuario.apellido}`,
    email: c.usuario.email,
    telefono: c.usuario.telefono,
    nombreUsuario: c.usuario.nombre_usuario,
    activo: c.usuario.activo,
    fechaRegistro: c.usuario.fecha_registro.toISOString(),
    preferenciaAlimentaria: c.preferencia_alimentaria,
    restriccionDietetica: c.restriccion_dietetica,
    cantidadPedidos: pedidos[c.id_cliente] ?? 0,
    cantidadVentas: ventas[c.id_cliente] ?? 0,
  };
}

async function conCantidades(clientes: ClienteConsultado[]): Promise<ClienteDTO[]> {
  const ids = clientes.map((c) => c.id_cliente);
  const [pedidos, ventas] = await Promise.all([
    conteos(`${PEDIDOS_URL}/interno/pedidos/conteo`, ids),
    conteos(`${VENTAS_URL}/interno/ventas/conteo`, ids),
  ]);
  return clientes.map((c) => aDTO(c, pedidos, ventas));
}

async function exigirFicha(idCliente: number): Promise<ClienteConsultado> {
  const cliente = await clienteModel.buscarDetalle(idCliente);
  if (!cliente) throw new ErrorApp(404, 'El cliente no existe');
  return cliente;
}

export async function listar(idUsuario: number, filtro: FiltroClientesDTO): Promise<Pagina<ClienteDTO>> {
  await exigirEmpleado(idUsuario, ACCION);
  const [clientes, total] = await clienteModel.listar(filtro);
  return pagina(await conCantidades(clientes), total, filtro);
}

export async function obtener(idUsuario: number, idCliente: number): Promise<ClienteDTO> {
  await exigirEmpleado(idUsuario, ACCION);
  return (await conCantidades([await exigirFicha(idCliente)]))[0];
}

export async function actualizar(idUsuario: number, idCliente: number, datos: DatosActualizarCliente): Promise<ClienteDTO> {
  await exigirEmpleado(idUsuario, ACCION);
  await exigirFicha(idCliente);
  // HU-20 · «El correo no se repite.»
  if (datos.email !== undefined && (await usuarioModel.existeNombreUsuarioOEmail('', datos.email, idCliente))) {
    throw new ErrorApp(409, 'El correo electrónico ya está registrado');
  }
  const cambios = {
    ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
    ...(datos.apellido !== undefined ? { apellido: datos.apellido } : {}),
    ...(datos.email !== undefined ? { email: datos.email } : {}),
    ...(datos.telefono !== undefined ? { telefono: datos.telefono ?? null } : {}),
  };
  if (Object.keys(cambios).length > 0) await usuarioModel.actualizar(idCliente, cambios);
  if (datos.activo === false) await usuarioModel.darDeBaja(idCliente);
  if (datos.activo === true) await usuarioModel.reactivar(idCliente);
  if (datos.preferenciaAlimentaria !== undefined || datos.restriccionDietetica !== undefined) {
    await clienteModel.actualizarPreferencias(idCliente, {
      preferenciaAlimentaria: datos.preferenciaAlimentaria,
      restriccionDietetica: datos.restriccionDietetica,
    });
  }
  return (await conCantidades([await exigirFicha(idCliente)]))[0];
}
