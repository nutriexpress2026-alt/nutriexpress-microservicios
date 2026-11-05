import { z } from 'zod';
import { tienePrecisionAdmitida } from '../utils/cantidad.js';

/** HU-17 · Lo que otro servicio pide reservar (o verificar sin reservar). */

const cantidadInsumo = z
  .number()
  .positive('la cantidad debe ser mayor a cero')
  .refine(tienePrecisionAdmitida, 'la cantidad admite hasta tres decimales');

const sinRepetir = (ids: number[]) => new Set(ids).size === ids.length;

const lineas = z
  .object({
    insumos: z
      .array(z.object({ idIngrediente: z.number().int().positive(), cantidad: cantidadInsumo }))
      .default([])
      .refine((l) => sinRepetir(l.map((x) => x.idIngrediente)), 'un insumo no puede repetirse'),
    productos: z
      .array(z.object({ idProducto: z.number().int().positive(), cantidad: z.number().int().positive() }))
      .default([])
      .refine((l) => sinRepetir(l.map((x) => x.idProducto)), 'un producto no puede repetirse'),
    destino: z
      .object({ idProducto: z.number().int().positive(), idAlmacen: z.number().int().positive().nullable().optional() })
      .nullable()
      .optional(),
  });

const conAlgo = <T extends { insumos: unknown[]; productos: unknown[] }>(p: T) =>
  p.insumos.length + p.productos.length > 0;

export const esquemaVerificar = lineas.refine(conAlgo, 'hay que pedir al menos un insumo o producto');

export const esquemaReserva = lineas
  .extend({
    id: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[\w-]+$/, 'el id de la reserva admite letras, números, guion y guion bajo'),
    origen: z.string().trim().min(1).max(30),
  })
  .refine(conAlgo, 'hay que reservar al menos un insumo o producto');
