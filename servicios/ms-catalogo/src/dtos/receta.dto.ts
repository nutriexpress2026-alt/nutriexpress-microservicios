import { z } from 'zod';
import { tienePrecisionAdmitida } from '../utils/cantidad.js';

/** HU-09 · CU-PRO-01 — Gestionar Producto y Receta (parte de receta). */

const cantidad = z
  .number()
  .positive('la cantidad debe ser mayor a cero')
  .max(999999.999, 'la cantidad excede el máximo admitido')
  .refine(tienePrecisionAdmitida, 'la cantidad admite hasta tres decimales (el gramo: 125 g son 0,125 kg)');

export const esquemaReceta = z.object({
  nombre: z.string().trim().min(2, 'el nombre de la versión es muy corto').max(100),
  /** Cuántas porciones salen de una corrida. */
  rendimiento: z
    .number()
    .int('el rendimiento es un número entero de porciones')
    .positive('el rendimiento debe ser al menos 1'),
  tiempoPreparacionMinutos: z.number().int().min(0).max(10000),
  instrucciones: z.string().trim().max(2000).nullable().optional(),
  divisible: z.boolean().default(true),
  insumos: z
    .array(z.object({ idIngrediente: z.number().int().positive(), cantidadRequerida: cantidad }))
    .min(1, 'la receta debe llevar al menos un insumo con su cantidad')
    .refine(
      (lineas) => new Set(lineas.map((l) => l.idIngrediente)).size === lineas.length,
      'un insumo no puede repetirse en la receta: sume las cantidades en una sola línea',
    ),
});

export type DatosReceta = z.infer<typeof esquemaReceta>;

export interface LineaRecetaDTO {
  idIngrediente: number;
  nombre: string;
  unidad: string;
  cantidadRequerida: number;
  /** Un insumo dado de baja en inventario no se puede usar para producir. */
  insumoActivo: boolean;
  costoUnitario: number;
}

export interface RecetaDTO {
  id: number;
  nombre: string;
  producto: { id: number; nombre: string };
  rendimiento: number;
  tiempoPreparacionMinutos: number;
  instrucciones: string | null;
  activa: boolean;
  divisible: boolean;
  insumos: LineaRecetaDTO[];
  /** Costo de una corrida con el costo vigente de cada insumo (HU-09: «conocer su costo»). */
  costoCorrida: number;
}
