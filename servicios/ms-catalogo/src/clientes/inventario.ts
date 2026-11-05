import { ErrorApp } from '../errors/error-app.js';
import * as insumoModel from '../models/insumo.model.js';

/**
 * Cliente REST de ms-inventario (RNF-ARQ-05, comunicación síncrona).
 *
 * El catálogo no lee las tablas de inventario (RNF-ARQ-02): las existencias y
 * el costo promedio de cada producto se los pide a ms-inventario por su ruta
 * interna, que el API Gateway no expone. Cada alta o cambio de producto se le
 * avisa con el evento ProductoGuardado (HT-03, `producto.service.ts`); aquí
 * queda solo lo que necesita respuesta en el momento.
 */
const URL = process.env.INVENTARIO_URL ?? 'http://ms-inventario:4003';

export interface ExistenciasProducto {
  idProducto: number;
  stockTotal: number;
  existencias: { idAlmacen: number; almacen: string; stock: number }[];
  costoPromedio: number | null;
}

/**
 * Existencias de varios productos. Devuelve `null` si ms-inventario no
 * responde: el catálogo se sigue mostrando, sin stock (RNF-DIS-01).
 */
export async function existencias(ids: number[]): Promise<Map<number, ExistenciasProducto> | null> {
  if (ids.length === 0) return new Map();
  try {
    const r = await fetch(`${URL}/interno/productos/existencias?ids=${ids.join(',')}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const lista = (await r.json()) as ExistenciasProducto[];
    return new Map(lista.map((e) => [e.idProducto, e]));
  } catch {
    return null;
  }
}

/**
 * Pide a ms-inventario que quite la réplica de un producto que se va a
 * eliminar. Responde 409 si ya tuvo movimientos: entonces no se elimina.
 */
export async function quitarProducto(id: number): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`${URL}/interno/productos/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) });
  } catch {
    throw new ErrorApp(503, 'No se puede eliminar ahora: el servicio de inventario no responde');
  }
  if (r.status === 409) {
    throw new ErrorApp(
      409,
      'No se puede eliminar el producto porque registra existencias o movimientos de inventario. Puede darlo de baja en su lugar.',
    );
  }
}

/**
 * HU-09 · Pone al día la réplica de insumos pidiéndole la lista completa a
 * ms-inventario. Se llama al arrancar: si un insumo cambió mientras el catálogo
 * estaba apagado, aquí se recupera. Si inventario no responde, reintenta.
 */
export async function sincronizarInsumos(intentos = 20): Promise<void> {
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(`${URL}/interno/insumos`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const insumos = (await r.json()) as insumoModel.DatosReplicaInsumo[];
      for (const insumo of insumos) await insumoModel.guardarReplica(insumo);
      console.log(`ms-catalogo: réplica de ${insumos.length} insumos al día`);
      return;
    } catch {
      await new Promise((ok) => setTimeout(ok, 3000));
    }
  }
  console.warn('ms-catalogo: ms-inventario no respondió; la réplica de insumos se actualizará con sus avisos');
}