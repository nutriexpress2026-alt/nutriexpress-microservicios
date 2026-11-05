import { z } from 'zod';

/**
 * HU-22 · Direcciones de entrega (adaptado del sistema anterior).
 *
 * «Coordenadas con seis decimales»: se redondean en el servidor, sea cual sea la
 * precisión que mande el navegador. La calle y la referencia son obligatorias:
 * el punto en el mapa ayuda, pero la referencia es la que encuentra la puerta.
 */
export const coordenada = (limite: number) =>
  z
    .number()
    .min(-limite)
    .max(limite)
    .transform((v) => Math.round(v * 1_000_000) / 1_000_000);

export const camposUbicacion = {
  calle: z.string().trim().min(3, 'indique la calle').max(150),
  numero: z.string().trim().max(20).nullable().optional(),
  referencia: z.string().trim().min(3, 'una referencia ayuda a encontrar la puerta').max(150),
  latitud: coordenada(90).nullable().optional(),
  longitud: coordenada(180).nullable().optional(),
} as const;

export const esquemaCrearUbicacion = z.object({
  ...camposUbicacion,
  etiqueta: z.string().trim().min(2, 'póngale un nombre, por ejemplo Casa').max(50),
  principal: z.boolean().optional(),
});

/**
 * El destino de un pedido: una dirección guardada (`{ idUbicacion }`) o una
 * escrita en el momento. Con etiqueta, la escrita queda guardada.
 */
export const esquemaDestinoPedido = z
  .object({
    idUbicacion: z.number().int().positive().optional(),
    calle: camposUbicacion.calle.optional(),
    numero: camposUbicacion.numero,
    referencia: camposUbicacion.referencia.optional(),
    latitud: camposUbicacion.latitud,
    longitud: camposUbicacion.longitud,
    etiqueta: z.string().trim().min(2).max(50).nullable().optional(),
  })
  .superRefine((datos, ctx) => {
    if (datos.idUbicacion !== undefined) return;
    if (!datos.calle) ctx.addIssue({ code: 'custom', path: ['calle'], message: 'indique la calle' });
    if (!datos.referencia) {
      ctx.addIssue({ code: 'custom', path: ['referencia'], message: 'una referencia ayuda a encontrar la puerta' });
    }
  });

export type DatosCrearUbicacion = z.infer<typeof esquemaCrearUbicacion>;
export type DatosDestinoPedido = z.infer<typeof esquemaDestinoPedido>;

export interface UbicacionDTO {
  id: number;
  etiqueta: string | null;
  calle: string;
  numero: string | null;
  referencia: string;
  latitud: number | null;
  longitud: number | null;
  principal: boolean;
  vigente: boolean;
}
