import { z } from 'zod';
import * as ordenModel from '../models/orden.model.js';
import type { OrdenCompleta } from '../models/orden.model.js';
import * as recetaService from './receta.service.js';
import * as inventario from '../clientes/inventario.js';
import { publicar, type Evento } from '../config/eventos.js';
import { ESTADOS_ORDEN, ESTADOS_ORDEN_CANCELABLES, FLUJO_ORDEN, type EstadoOrden, type TipoConservacion } from '../config/dominio.js';
import { ErrorApp } from '../errors/error-app.js';
import { dosDecimales } from '../utils/dinero.js';
import { redondearCantidad } from '../utils/cantidad.js';
import { pagina, type Pagina } from '../dtos/paginacion.dto.js';
import type { InsumoRequeridoDTO, OrdenProduccionDTO } from '../dtos/orden.dto.js';
import type { Sesion } from '../middlewares/auth.middleware.js';

/**
 * HU-10 · CU-PRO-02 Gestionar Orden de Producción y CU-PRO-04 Cancelarla.
 *
 * Criterios de aceptación: calcula los insumos según el rendimiento; no se
 * finaliza sin insumos suficientes; al finalizar se descuentan los insumos y se
 * suma el producto.
 *
 * La orden es de este servicio; el stock, de ms-inventario. Al finalizar: (1) se
 * reservan los insumos en inventario (HU-17), que rechaza si no alcanzan; (2) la
 * orden queda Finalizada; (3) se publica OrdenFinalizada, e inventario registra la
 * nota de egreso y la de ingreso en una transacción y devuelve sus números
 * (ProduccionRegistrada). Si el aviso no sale, la orden vuelve a En proceso y la
 * reserva se libera.
 */

/** Lo que hace falta de una receta para calcular: su rendimiento y sus líneas con el insumo. */
type RecetaParaCalcular = Pick<OrdenCompleta['receta'], 'rendimiento' | 'detalle_receta'>;

/** Los insumos de una corrida: cantidad requerida × porciones / rendimiento, al gramo. */
function prevision(cantidad: number, receta: RecetaParaCalcular): InsumoRequeridoDTO[] {
  const factor = cantidad / receta.rendimiento;
  return receta.detalle_receta.map((d) => ({
    idIngrediente: d.id_ingrediente,
    nombre: d.insumo.nombre,
    unidad: d.insumo.unidad,
    cantidadRequerida: redondearCantidad(Number(d.cantidad_requerida) * factor),
    costoUnitario: Number(d.insumo.costo_unitario),
  }));
}

const costoDe = (lineas: InsumoRequeridoDTO[]) =>
  dosDecimales(lineas.reduce((t, l) => t + dosDecimales(l.cantidadRequerida * l.costoUnitario), 0));

export function aDTO(o: OrdenCompleta): OrdenProduccionDTO {
  const estado = o.estado as EstadoOrden;
  const finalizada = estado === 'Finalizada';
  const insumos = finalizada
    ? o.detalle_orden_insumo.map((d) => ({
        idIngrediente: d.id_ingrediente,
        nombre: d.nombre,
        unidad: d.unidad,
        cantidadRequerida: Number(d.cantidad),
        costoUnitario: Number(d.costo_unitario),
      }))
    : prevision(o.cantidad, o.receta);
  const costo = finalizada && o.costo_total !== null ? Number(o.costo_total) : costoDe(insumos);
  const obtenida = o.cantidad_obtenida;
  return {
    id: o.id_orden_produccion,
    fecha: o.fecha.toISOString(),
    estado,
    cantidad: o.cantidad,
    fechaFinalizacion: o.fecha_finalizacion?.toISOString() ?? null,
    transicionesPosibles: FLUJO_ORDEN[estado],
    cancelable: ESTADOS_ORDEN_CANCELABLES.includes(estado),
    receta: { id: o.receta.id_receta, nombre: o.receta.nombre, rendimiento: o.receta.rendimiento },
    producto: {
      id: o.receta.producto.id_producto,
      nombre: o.receta.producto.nombre,
      tipoConservacion: o.receta.producto.tipo_conservacion as TipoConservacion,
    },
    registradoPor: { id: o.id_empleado, nombreCompleto: o.empleado_nombre },
    insumosRequeridos: insumos,
    costoEstimado: costo,
    cantidadObtenida: obtenida,
    merma: obtenida !== null && obtenida < o.cantidad ? o.cantidad - obtenida : null,
    costoUnitario: obtenida ? dosDecimales(costo / obtenida) : null,
    almacenDestino:
      o.id_almacen_destino !== null && o.almacen_destino !== null
        ? { id: o.id_almacen_destino, nombre: o.almacen_destino }
        : null,
    notas: { egreso: o.id_nota_egreso, ingreso: o.id_nota_ingreso },
  };
}

async function exigirOrden(id: number): Promise<OrdenCompleta> {
  const orden = await ordenModel.buscarPorId(id);
  if (!orden) throw new ErrorApp(404, `La orden #${id} no existe`);
  return orden;
}

export async function obtener(id: number): Promise<OrdenProduccionDTO> {
  return aDTO(await exigirOrden(id));
}

export async function listar(filtro: Parameters<typeof ordenModel.listar>[0]): Promise<Pagina<OrdenProduccionDTO>> {
  const [ordenes, total] = await ordenModel.listar(filtro);
  return pagina(ordenes.map(aDTO), total, filtro);
}

/** Cuántas hay en cada estado (todos los estados, aunque sea cero). */
export async function resumen(): Promise<Record<EstadoOrden, number>> {
  const conteos = Object.fromEntries(ESTADOS_ORDEN.map((e) => [e, 0])) as Record<EstadoOrden, number>;
  for (const fila of await ordenModel.resumen()) conteos[fila.estado as EstadoOrden] = fila._count._all;
  return conteos;
}

/**
 * Registra una orden Pendiente con la receta activa del producto. Si los
 * insumos no alcanzan, no se registra (se le pregunta a inventario, sin reservar).
 */
export async function crear(sesion: Sesion, datos: { idReceta: number; cantidad: number }): Promise<OrdenProduccionDTO> {
  const receta = await recetaService.exigirReceta(datos.idReceta);
  if (!receta.activa) throw new ErrorApp(409, 'Solo se produce con la receta activa del producto');
  if (!receta.producto.activo) throw new ErrorApp(409, `El producto "${receta.producto.nombre}" está dado de baja`);
  const deBaja = receta.detalle_receta.filter((d) => !d.insumo.activo).map((d) => d.insumo.nombre);
  if (deBaja.length > 0) throw new ErrorApp(409, `La receta usa insumos dados de baja: ${deBaja.join(', ')}`);

  // Una receta no divisible se produce en corridas completas.
  if (!receta.divisible && datos.cantidad % receta.rendimiento !== 0) {
    const valida = Math.ceil(datos.cantidad / receta.rendimiento) * receta.rendimiento;
    throw new ErrorApp(
      400,
      `La receta "${receta.nombre}" no se puede hacer por partes: se produce en corridas completas de ` +
        `${receta.rendimiento} porciones. Puede producir ${valida}.`,
    );
  }

  const insumos = prevision(datos.cantidad, receta);
  await inventario.verificarInsumos(insumos.map((l) => ({ idIngrediente: l.idIngrediente, cantidad: l.cantidadRequerida })));

  const creada = await ordenModel.crear({
    idReceta: datos.idReceta,
    cantidad: datos.cantidad,
    idEmpleado: sesion.idUsuario,
    empleadoNombre: `${sesion.nombre} ${sesion.apellido}`,
  });
  return aDTO(await exigirOrden(creada.id_orden_produccion));
}

/** Pendiente → En proceso. Los insumos todavía no se consumen. */
export async function iniciar(id: number): Promise<OrdenProduccionDTO> {
  const orden = await exigirOrden(id);
  if (!(await ordenModel.cambiarEstado(id, ['Pendiente'], 'En proceso'))) {
    throw new ErrorApp(409, `La orden está ${orden.estado}: solo se inicia una orden Pendiente`);
  }
  return obtener(id);
}

/** CU-PRO-04: mientras esté Pendiente o En proceso. Si quedó una reserva suelta, se libera. */
export async function cancelar(id: number): Promise<OrdenProduccionDTO> {
  const orden = await exigirOrden(id);
  if (!(await ordenModel.cambiarEstado(id, ESTADOS_ORDEN_CANCELABLES, 'Cancelada'))) {
    throw new ErrorApp(409, `No se puede cancelar una orden ${orden.estado}`);
  }
  await inventario.liberar(`orden-${id}`);
  return obtener(id);
}

export async function finalizar(
  id: number,
  sesion: Sesion,
  datos: { cantidadObtenida: number; idAlmacenDestino?: number | null },
): Promise<OrdenProduccionDTO> {
  const orden = await exigirOrden(id);
  if (orden.estado !== 'En proceso') {
    throw new ErrorApp(
      409,
      orden.estado === 'Pendiente'
        ? 'La orden todavía está Pendiente: inicie la producción antes de finalizarla'
        : `La orden está ${orden.estado}: solo se finaliza una orden En proceso`,
    );
  }
  if (datos.cantidadObtenida > orden.cantidad) {
    throw new ErrorApp(400, `No se pueden registrar más porciones que las planificadas (${orden.cantidad})`);
  }

  // (1) Reserva en inventario: si los insumos no alcanzan, aquí se rechaza y la orden sigue En proceso.
  const idReserva = `orden-${id}`;
  const reserva = await inventario.reservar({
    id: idReserva,
    origen: 'ms-catalogo',
    insumos: prevision(orden.cantidad, orden.receta).map((l) => ({ idIngrediente: l.idIngrediente, cantidad: l.cantidadRequerida })),
    destino:
      datos.cantidadObtenida > 0
        ? { idProducto: orden.receta.producto.id_producto, idAlmacen: datos.idAlmacenDestino ?? null }
        : null,
  });
  if (reserva.estado !== 'Activa') throw new ErrorApp(409, 'Esta orden ya se registró en inventario');

  // (2) La orden queda Finalizada con el hecho: lo que se reservó y a qué costo.
  const finalizada = await ordenModel.finalizar(id, {
    cantidadObtenida: datos.cantidadObtenida,
    costoTotal: reserva.costoInsumos,
    almacen: reserva.almacenDestino,
    insumos: reserva.insumos,
  });
  // Otro pedido la finalizó a la vez; la reserva es la de ese pedido: no se toca.
  if (!finalizada) throw new ErrorApp(409, 'La orden ya no está En proceso');

  // (3) Inventario descuenta los insumos e ingresa el producto al recibir el evento.
  try {
    await publicar('OrdenFinalizada', {
      idOrden: id,
      idReserva,
      idProducto: orden.receta.producto.id_producto,
      cantidadObtenida: datos.cantidadObtenida,
      empleado: { id: sesion.idUsuario, nombre: sesion.nombre, apellido: sesion.apellido },
    });
  } catch (e) {
    console.error(`ms-catalogo: OrdenFinalizada #${id} no salió (${(e as Error).message}); se deshace`);
    await ordenModel.deshacerFinalizacion(id);
    await inventario.liberar(idReserva);
    throw new ErrorApp(503, 'No se pudo finalizar: el aviso a inventario no salió. Intente de nuevo en unos segundos.');
  }
  return obtener(id);
}

/** ProduccionRegistrada (de ms-inventario): la orden guarda sus notas y el costo real. */
export async function produccionRegistrada(evento: Evento): Promise<void> {
  const d = z
    .object({
      idOrden: z.number().int().positive(),
      idNotaEgreso: z.number().int().positive(),
      idNotaIngreso: z.number().int().positive().nullable(),
      costoTotal: z.number().min(0),
    })
    .parse(evento.datos);
  await ordenModel.registrarProduccion(d.idOrden, d);
}
