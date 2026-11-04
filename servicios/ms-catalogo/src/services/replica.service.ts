import { z } from 'zod';
import * as insumoModel from '../models/insumo.model.js';
import type { Evento } from '../config/eventos.js';

/**
 * HU-09 · Réplica local de los insumos de ms-inventario (RNF-ARQ-02), para
 * armar recetas y calcular su costo sin leer la base de inventario.
 *
 * Se actualiza con InsumoGuardado (alta, cambio, baja o un costo nuevo tras una
 * compra) e InsumoEliminado. Si un aviso se pierde, la réplica se pone al día al
 * arrancar (`clientes/inventario.ts`, lista completa).
 */
const esquemaInsumo = z.object({
  id: z.number().int().positive(),
  nombre: z.string().min(1).max(100),
  unidad: z.string().min(1).max(10),
  costoUnitario: z.number().min(0),
  activo: z.boolean(),
});

export async function insumoGuardado(evento: Evento): Promise<void> {
  await insumoModel.guardarReplica(esquemaInsumo.parse(evento.datos));
}

export async function insumoEliminado(evento: Evento): Promise<void> {
  const { id } = z.object({ id: z.number().int().positive() }).parse(evento.datos);
  await insumoModel.quitarReplica(id);
}
