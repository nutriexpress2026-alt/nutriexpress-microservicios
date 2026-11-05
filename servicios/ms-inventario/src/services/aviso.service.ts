import { publicar } from '../config/eventos.js';
import * as insumoModel from '../models/insumo.model.js';

/**
 * Publica un evento sin que un RabbitMQ caído tumbe la operación que lo
 * originó (RNF-DIS-01): lo que se guardó en la base queda guardado, y el error
 * se registra para revisarlo.
 */
export async function avisar<D>(tipo: string, datos: D): Promise<void> {
  try {
    await publicar(tipo, datos);
  } catch (e) {
    console.error(`ms-inventario: no se pudo publicar ${tipo} (${(e as Error).message})`);
  }
}

/**
 * HU-09 · InsumoGuardado de cada insumo indicado, con lo que la réplica de
 * ms-catalogo necesita para las recetas: nombre, unidad, costo y si está activo.
 */
export async function avisarInsumos(ids: number[]): Promise<void> {
  for (const insumo of await insumoModel.paraReplica([...new Set(ids)])) {
    await avisar('InsumoGuardado', insumo);
  }
}
