import { prisma } from '../config/prisma.js';
import * as pedidoModel from '../models/pedido.model.js';
import * as repartoModel from '../models/reparto.model.js';
import type { ClientePrisma, FiltroGestion, PedidoConDetalle } from '../models/pedido.model.js';
import * as servicios from '../clientes/servicios.js';
import { aDetalleDTO, avisarEstado, compensarCancelacion, seguimientoDe } from './pedido.service.js';
import { pagina, type Pagina } from '../dtos/paginacion.dto.js';
import type { PedidoDetalleDTO, SeguimientoDTO } from '../dtos/pedido.dto.js';
import {
  CARGO_REPARTIDOR,
  ESTADOS_OCUPAN_REPARTIDOR,
  esTransicionValida,
  transicionesPosibles,
  type EstadoPedido,
} from '../config/dominio.js';
import type { Sesion } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * HU-23 · Tablero de pedidos y HU-24 · Mis entregas: el lado del personal.
 * Adaptado de `pedido-gestion.service.ts`, `reparto.service.ts` y
 * `seguimiento.service.ts` del sistema anterior.
 *
 * Criterios: «solo se asignan empleados con cargo Repartidor» (se pregunta a
 * ms-identidad, dueño de los empleados); «los estados siguen el flujo definido»
 * (FLUJO_DE_ESTADOS); «solo el repartidor asignado cierra la entrega»; «entregar
 * cobra el efectivo» (ms-pagos) y consume la reserva (ms-inventario); «no entregar
 * devuelve el stock» (PedidoCancelado libera la reserva).
 */

/** Quien tiene este permiso cierra entregas de otros (el administrador, si el repartidor no puede). */
const PERMISO_CERRAR_AJENO = 'PEDIDO_CERRAR_AJENO';
const TERMINALES: EstadoPedido[] = ['Entregado', 'Cancelado'];

export interface RepartidorDTO {
  id: number;
  nombreCompleto: string;
  telefono: string | null;
  disponible: boolean;
  entregasEnCurso: number;
}

export interface PedidoGestionDTO extends PedidoDetalleDTO {
  cliente: { id: number; nombreCompleto: string; telefono: string | null };
  repartidor: { id: number; nombreCompleto: string } | null;
  transicionesPosibles: EstadoPedido[];
}

/** El token dice si es personal: solo un empleado tiene cargo. */
function exigirEmpleado(sesion: Sesion, para: string): Sesion {
  if (!sesion.cargo) throw new ErrorApp(403, `Solo el personal puede ${para}`);
  return sesion;
}

const nombreDe = (s: Sesion) => `${s.nombre} ${s.apellido}`.trim();

function aGestionDTO(p: PedidoConDetalle): PedidoGestionDTO {
  return {
    ...aDetalleDTO(p),
    // El teléfono del cliente es de ms-identidad: el pedido guarda solo su nombre.
    cliente: { id: p.id_usuario, nombreCompleto: p.cliente_nombre, telefono: null },
    repartidor: p.id_repartidor === null ? null : { id: p.id_repartidor, nombreCompleto: p.repartidor_nombre ?? '' },
    transicionesPosibles: transicionesPosibles(p.estado_pedido as EstadoPedido),
  };
}

async function exigirPedido(id: number): Promise<PedidoConDetalle> {
  const pedido = await pedidoModel.buscarPorId(id);
  if (!pedido) throw new ErrorApp(404, 'El pedido no existe');
  return pedido;
}

/* ------------------------------------------------------------------ */
/* HU-23 · Tablero                                                     */
/* ------------------------------------------------------------------ */

export async function listar(sesion: Sesion, filtro: FiltroGestion): Promise<Pagina<PedidoGestionDTO>> {
  exigirEmpleado(sesion, 'gestionar los pedidos');
  const [pedidos, total] = await pedidoModel.listarTodos(filtro);
  return pagina(pedidos.map(aGestionDTO), total, filtro);
}

export async function resumen(sesion: Sesion, filtro: { desde?: string; hasta?: string }): Promise<Record<string, number>> {
  exigirEmpleado(sesion, 'gestionar los pedidos');
  const filas = await pedidoModel.contarPorEstado(filtro);
  return Object.fromEntries(filas.map((f) => [f.estado_pedido, f._count._all]));
}

export async function detalle(sesion: Sesion, id: number): Promise<PedidoGestionDTO> {
  exigirEmpleado(sesion, 'gestionar los pedidos');
  return aGestionDTO(await exigirPedido(id));
}

export async function seguimiento(sesion: Sesion, id: number): Promise<SeguimientoDTO> {
  exigirEmpleado(sesion, 'gestionar los pedidos');
  return seguimientoDe(await exigirPedido(id));
}

/**
 * Los repartidores, del que menos entregas tiene en curso al que más; a igual
 * carga, el que está libre hace más tiempo. Quiénes son lo dice ms-identidad; su
 * turno y su carga, este servicio.
 */
async function repartidoresPorPrioridad(): Promise<RepartidorDTO[]> {
  const [lista, turnos, carga] = await Promise.all([
    servicios.repartidores(),
    repartoModel.turnos(),
    pedidoModel.cargaDeRepartidores(ESTADOS_OCUPAN_REPARTIDOR),
  ]);
  const deTurno = new Map(turnos.map((t) => [t.id_empleado, t.disponible]));
  const cargaDe = new Map(carga.map((c) => [c.id_repartidor!, { cuantos: c._count._all, desde: c._min.fecha?.getTime() ?? Infinity }]));
  return lista
    .map((r) => ({
      dto: {
        id: r.id,
        nombreCompleto: `${r.nombre} ${r.apellido}`,
        telefono: r.telefono,
        disponible: deTurno.get(r.id) ?? false,
        entregasEnCurso: cargaDe.get(r.id)?.cuantos ?? 0,
      },
      ocupadoDesde: cargaDe.get(r.id)?.desde ?? Infinity,
    }))
    .sort((a, b) => a.dto.entregasEnCurso - b.dto.entregasEnCurso || a.ocupadoDesde - b.ocupadoDesde || a.dto.id - b.dto.id)
    .map((r) => r.dto);
}

export async function listarRepartidores(sesion: Sesion): Promise<RepartidorDTO[]> {
  exigirEmpleado(sesion, 'gestionar los pedidos');
  return repartidoresPorPrioridad();
}

const esAsignable = (estado: EstadoPedido) => estado === 'Recibido' || estado === 'En preparacion' || estado === 'En camino';

/** RF-PED-04 · El sistema **sugiere**; asignar sigue siendo una decisión de quien gestiona. */
export async function sugerirRepartidor(sesion: Sesion, id: number) {
  exigirEmpleado(sesion, 'gestionar los pedidos');
  const pedido = await exigirPedido(id);
  const estado = pedido.estado_pedido as EstadoPedido;
  if (!esAsignable(estado)) throw new ErrorApp(409, `No se puede asignar un repartidor a un pedido ${estado}`);

  const candidatos = await repartidoresPorPrioridad();
  const deTurno = candidatos.filter((r) => r.disponible);
  if (deTurno.length === 0) {
    return {
      sugerido: null,
      motivo: candidatos.length === 0 ? 'No hay ningún empleado con cargo Repartidor' : 'Ningún repartidor está de turno en este momento',
      candidatos,
    };
  }
  const elegido = deTurno[0];
  return {
    sugerido: elegido,
    motivo:
      elegido.entregasEnCurso === 0
        ? 'Está de turno y no tiene entregas en curso'
        : `Es quien menos entregas tiene en curso (${elegido.entregasEnCurso})`,
    candidatos,
  };
}

/** HU-23 · «Solo se asignan empleados con cargo Repartidor.» */
export async function asignarRepartidor(sesion: Sesion, id: number, idRepartidor: number): Promise<PedidoGestionDTO> {
  exigirEmpleado(sesion, 'gestionar los pedidos');
  const pedido = await exigirPedido(id);
  const estado = pedido.estado_pedido as EstadoPedido;
  if (TERMINALES.includes(estado)) throw new ErrorApp(409, `No se puede asignar un repartidor a un pedido ${estado}`);

  const empleado = await servicios.empleado(idRepartidor);
  if (empleado.cargo !== CARGO_REPARTIDOR) {
    throw new ErrorApp(409, `Solo puede asignarse personal con cargo ${CARGO_REPARTIDOR}; el empleado indicado tiene el cargo ${empleado.cargo}`);
  }
  if (!empleado.activo) throw new ErrorApp(409, 'El repartidor indicado está dado de baja');
  await pedidoModel.asignarRepartidor(id, idRepartidor, `${empleado.nombre} ${empleado.apellido}`);
  // HU-29 · «Distingue asignados de entregados»: el reporte sabe a quién se asignó.
  await avisarEstado(pedido);
  return aGestionDTO(await exigirPedido(id));
}

/* ------------------------------------------------------------------ */
/* HU-23, HU-24 · Avanzar el estado                                    */
/* ------------------------------------------------------------------ */

/** Solo el repartidor asignado cierra la entrega, salvo quien tiene PEDIDO_CERRAR_AJENO. */
function exigirQuePuedaCerrar(sesion: Sesion, pedido: PedidoConDetalle): void {
  if (pedido.id_repartidor === sesion.idUsuario) return;
  if (sesion.permisos.includes(PERMISO_CERRAR_AJENO)) return;
  throw new ErrorApp(403, 'Solo el repartidor asignado puede cerrar esta entrega. Si no está disponible, debe hacerlo un administrador.');
}

/** El repartidor deja de compartir su posición cuando ya no lleva nada en camino. */
async function olvidarSiTermino(idRepartidor: number | null, tx: ClientePrisma = prisma): Promise<void> {
  if (idRepartidor !== null && (await pedidoModel.cuantosEnCamino(idRepartidor, tx)) === 0) {
    await repartoModel.borrarPosicion(idRepartidor, tx);
  }
}

export async function avanzarEstado(sesion: Sesion, id: number, destino: EstadoPedido): Promise<PedidoGestionDTO> {
  exigirEmpleado(sesion, 'gestionar los pedidos');
  const pedido = await exigirPedido(id);
  const origen = pedido.estado_pedido as EstadoPedido;

  if (!esTransicionValida(origen, destino)) {
    const posibles = transicionesPosibles(origen);
    throw new ErrorApp(
      409,
      `Transición no permitida: ${posibles.length ? `desde ${origen} solo puede pasar a ${posibles.join(' o ')}` : `el pedido está en estado ${origen} y ya no admite cambios`}`,
    );
  }
  if (destino === 'En camino' && pedido.id_repartidor === null) {
    throw new ErrorApp(409, 'Asigne un repartidor antes de marcar el pedido en camino');
  }

  if (destino === 'Entregado') {
    exigirQuePuedaCerrar(sesion, pedido);
    const empleado = { id: sesion.idUsuario, nombre: sesion.nombre, apellido: sesion.apellido };
    // Primero lo que puede fallar en otro servicio; los dos son idempotentes, así
    // que si el cambio de estado falla después, reintentar no descuenta ni cobra dos veces.
    const salida = await servicios.consumir(pedido.id_reserva, `Pedido #${pedido.id_pedido} entregado`, empleado);
    const costos = new Map(
      (salida?.lineas ?? []).filter((l) => l.costoUnitario !== undefined).map((l) => [l.idProducto, Number(l.costoUnitario)]),
    );
    const cobraEfectivo = pedido.metodo_pago === 'Efectivo' && pedido.estado_pago !== 'Pagado';
    if (cobraEfectivo) await servicios.registrarEfectivo(pedido.id_pedido, Number(pedido.total), nombreDe(sesion));

    const aplicado = await prisma.$transaction(async (tx: ClientePrisma) => {
      const ok = await pedidoModel.cambiarEstadoSiEsta(tx, id, origen, {
        estado: 'Entregado',
        fechaEntrega: new Date(),
        ...(cobraEfectivo ? { estadoPago: 'Pagado' } : {}),
      });
      if (ok) {
        await pedidoModel.guardarCostos(tx, id, costos);
        await olvidarSiTermino(pedido.id_repartidor, tx);
      }
      return ok;
    });
    if (!aplicado) throw new ErrorApp(409, 'El pedido cambió de estado mientras tanto: vuelva a mirarlo');
    await avisarEstado(pedido, 'Entregado');
    return aGestionDTO(await exigirPedido(id));
  }

  if (destino === 'Cancelado') {
    // HU-24 · «No entregar devuelve el stock»: PedidoCancelado libera la reserva.
    exigirQuePuedaCerrar(sesion, pedido);
    const aplicado = await prisma.$transaction(async (tx: ClientePrisma) => {
      const ok = await pedidoModel.cambiarEstadoSiEsta(tx, id, origen, { estado: 'Cancelado', motivo: 'No entregado' });
      if (ok) await olvidarSiTermino(pedido.id_repartidor, tx);
      return ok;
    });
    if (!aplicado) throw new ErrorApp(409, 'El pedido cambió de estado mientras tanto: vuelva a mirarlo');
    await compensarCancelacion(pedido, 'No entregado');
    return aGestionDTO(await exigirPedido(id));
  }

  if (!(await prisma.$transaction((tx: ClientePrisma) => pedidoModel.cambiarEstadoSiEsta(tx, id, origen, { estado: destino })))) {
    throw new ErrorApp(409, 'El pedido cambió de estado mientras tanto: vuelva a mirarlo');
  }
  await avisarEstado(pedido, destino);
  return aGestionDTO(await exigirPedido(id));
}

/* ------------------------------------------------------------------ */
/* HU-24 · Mis entregas, turno y posición                              */
/* ------------------------------------------------------------------ */

export async function misEntregas(sesion: Sesion): Promise<PedidoGestionDTO[]> {
  exigirEmpleado(sesion, 'consultar sus entregas');
  return (await pedidoModel.listarDeRepartidor(sesion.idUsuario, ESTADOS_OCUPAN_REPARTIDOR)).map(aGestionDTO);
}

export async function consultarDisponibilidad(sesion: Sesion) {
  exigirEmpleado(sesion, 'consultar su turno');
  return { disponible: await repartoModel.disponibilidad(sesion.idUsuario) };
}

export async function cambiarDisponibilidad(sesion: Sesion, disponible: boolean) {
  exigirEmpleado(sesion, 'declarar su turno');
  return { disponible: (await repartoModel.cambiarDisponibilidad(sesion.idUsuario, disponible)).disponible };
}

/** HU-24 · La ubicación se comparte solo mientras lleva un pedido en camino (RF-PED-07). */
export async function informarPosicion(sesion: Sesion, datos: { latitud: number; longitud: number; precision?: number | null }): Promise<void> {
  exigirEmpleado(sesion, 'compartir su ubicación');
  if ((await pedidoModel.cuantosEnCamino(sesion.idUsuario)) === 0) {
    await repartoModel.borrarPosicion(sesion.idUsuario);
    throw new ErrorApp(409, 'La ubicación se comparte solo mientras lleva un pedido en camino');
  }
  await repartoModel.guardarPosicion(sesion.idUsuario, { latitud: datos.latitud, longitud: datos.longitud, precision: datos.precision ?? null });
}

export async function dejarDeCompartir(sesion: Sesion): Promise<void> {
  exigirEmpleado(sesion, 'compartir su ubicación');
  await repartoModel.borrarPosicion(sesion.idUsuario);
}
