import { z } from 'zod';
import { camposDePagina } from './paginacion.dto.js';
import { ESTADOS_ORDEN, type EstadoOrden, type TipoConservacion } from '../config/dominio.js';

/** HU-10 · CU-PRO-02 y CU-PRO-04 — órdenes de producción. */

export const esquemaCrearOrden = z.object({
  idReceta: z.number().int().positive(),
  /** Porciones a producir. */
  cantidad: z.number().int('las porciones son un número entero').positive('produzca al menos una porción').max(10000),
});

export const esquemaFinalizarOrden = z.object({
  /** Cuántas salieron de verdad: la diferencia con lo planificado es merma. */
  cantidadObtenida: z.number().int('las porciones obtenidas son un número entero').min(0),
  /** Sin él, inventario usa el almacén preferido (o el único) de la conservación del producto. */
  idAlmacenDestino: z.number().int().positive().nullable().optional(),
});

export const esquemaFiltroOrdenes = z.object({
  estado: z.enum(ESTADOS_ORDEN).optional(),
  ...camposDePagina,
});

export interface InsumoRequeridoDTO {
  idIngrediente: number;
  nombre: string;
  unidad: string;
  cantidadRequerida: number;
  costoUnitario: number;
}

/** El contrato de la pantalla de órdenes (`OrdenProduccion` en el frontend). */
export interface OrdenProduccionDTO {
  id: number;
  fecha: string;
  estado: EstadoOrden;
  cantidad: number;
  fechaFinalizacion: string | null;
  transicionesPosibles: EstadoOrden[];
  cancelable: boolean;
  receta: { id: number; nombre: string; rendimiento: number };
  producto: { id: number; nombre: string; tipoConservacion: TipoConservacion };
  registradoPor: { id: number; nombreCompleto: string };
  /** Antes de finalizar, la previsión desde la receta; después, lo que se consumió. */
  insumosRequeridos: InsumoRequeridoDTO[];
  /** Previsión antes de ejecutar; el costo real de la corrida después. */
  costoEstimado: number;
  cantidadObtenida: number | null;
  /** Planificado menos obtenido, cuando salió de menos. */
  merma: number | null;
  /** El costo repartido entre lo obtenido, no entre lo planificado. */
  costoUnitario: number | null;
  almacenDestino: { id: number; nombre: string } | null;
  notas: { egreso: number | null; ingreso: number | null };
}
