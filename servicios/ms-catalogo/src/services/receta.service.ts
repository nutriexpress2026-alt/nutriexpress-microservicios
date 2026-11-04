import * as recetaModel from '../models/receta.model.js';
import * as insumoModel from '../models/insumo.model.js';
import * as productoModel from '../models/producto.model.js';
import type { RecetaCompleta } from '../models/receta.model.js';
import { ErrorApp } from '../errors/error-app.js';
import { dosDecimales } from '../utils/dinero.js';
import type { DatosReceta, RecetaDTO } from '../dtos/receta.dto.js';

/**
 * HU-09 · CU-PRO-01 — Gestionar Receta (RF-PRO-04).
 *
 * Criterios de aceptación: una sola receta activa por producto; los insumos se
 * eligen de los registrados en inventario. Los insumos se leen de la réplica
 * local (RNF-ARQ-02), que mantiene el evento InsumoGuardado.
 */

export function aDTO(r: RecetaCompleta): RecetaDTO {
  const insumos = r.detalle_receta.map((d) => ({
    idIngrediente: d.id_ingrediente,
    nombre: d.insumo.nombre,
    unidad: d.insumo.unidad,
    cantidadRequerida: Number(d.cantidad_requerida),
    insumoActivo: d.insumo.activo,
    costoUnitario: Number(d.insumo.costo_unitario),
  }));
  return {
    id: r.id_receta,
    nombre: r.nombre,
    producto: { id: r.producto.id_producto, nombre: r.producto.nombre },
    rendimiento: r.rendimiento,
    tiempoPreparacionMinutos: r.tiempo_preparacion_minutos,
    instrucciones: r.instrucciones,
    activa: r.activa,
    divisible: r.divisible,
    insumos,
    costoCorrida: dosDecimales(insumos.reduce((t, l) => t + dosDecimales(l.cantidadRequerida * l.costoUnitario), 0)),
  };
}

async function exigirProducto(id: number) {
  const producto = await productoModel.buscarParaGestion(id);
  if (!producto) throw new ErrorApp(404, 'El producto no existe');
  return producto;
}

export async function exigirReceta(id: number): Promise<RecetaCompleta> {
  const receta = await recetaModel.buscarPorId(id);
  if (!receta) throw new ErrorApp(404, 'La receta no existe');
  return receta;
}

/** Los insumos tienen que estar registrados en inventario y activos. */
async function exigirInsumos(datos: DatosReceta): Promise<void> {
  const ids = datos.insumos.map((l) => l.idIngrediente);
  const encontrados = await insumoModel.existentes(ids);
  const porId = new Map(encontrados.map((i) => [i.id_ingrediente, i]));

  const faltan = ids.filter((id) => !porId.has(id));
  if (faltan.length > 0) {
    throw new ErrorApp(
      404,
      `Insumos que no están registrados en inventario: ${faltan.join(', ')}. ` +
        'Si se acaban de registrar, espere unos segundos y vuelva a intentarlo.',
    );
  }
  const deBaja = encontrados.filter((i) => !i.activo).map((i) => i.nombre);
  if (deBaja.length > 0) {
    throw new ErrorApp(409, `Insumos dados de baja en inventario: ${deBaja.join(', ')}`);
  }
}

export async function listarDeProducto(idProducto: number): Promise<RecetaDTO[]> {
  await exigirProducto(idProducto);
  return (await recetaModel.listarDeProducto(idProducto)).map(aDTO);
}

/** Una versión nueva nace inactiva (RF-PRO-04): activarla es una operación aparte. */
export async function crear(idProducto: number, datos: DatosReceta): Promise<RecetaDTO> {
  await exigirProducto(idProducto);
  await exigirInsumos(datos);
  const creada = await recetaModel.crear(idProducto, datos);
  return aDTO(await exigirReceta(creada.id_receta));
}

export async function actualizar(id: number, datos: DatosReceta): Promise<RecetaDTO> {
  await exigirReceta(id);
  await exigirInsumos(datos);
  await recetaModel.actualizar(id, datos);
  return aDTO(await exigirReceta(id));
}

/** Activa una versión y desactiva la anterior, en la misma transacción. */
export async function activar(id: number): Promise<RecetaDTO> {
  const receta = await exigirReceta(id);
  if (receta.activa) return aDTO(receta);
  const deBaja = receta.detalle_receta.filter((d) => !d.insumo.activo).map((d) => d.insumo.nombre);
  if (deBaja.length > 0) {
    throw new ErrorApp(
      409,
      `La versión usa insumos dados de baja en inventario (${deBaja.join(', ')}). Cámbielos antes de activarla.`,
    );
  }
  await recetaModel.activar(id, receta.id_producto);
  return aDTO(await exigirReceta(id));
}

/** La versión activa no se elimina: es la que se usa para producir. */
export async function eliminar(id: number): Promise<void> {
  const receta = await exigirReceta(id);
  if (receta.activa) {
    throw new ErrorApp(409, 'No se puede eliminar la versión activa: active otra versión antes.');
  }
  await recetaModel.eliminar(id);
}
