import { z } from 'zod';
import * as productoModel from '../models/producto.model.js';
import { TIPOS_CONSERVACION } from '../config/dominio.js';
import type { Evento } from '../config/eventos.js';

/**
 * Réplica local de los productos de ms-catalogo (RNF-ARQ-02).
 *
 * HT-03 · T2.2: se actualiza con el evento `ProductoGuardado`, que ms-catalogo
 * publica al crear o cambiar un producto (antes era un PUT a /interno). Si un
 * aviso se pierde, la réplica igual se pone al día al arrancar
 * (`clientes/catalogo.ts`, lista completa).
 *
 * Eliminar no va por evento: necesita una respuesta en el momento —409 si el
 * producto ya tuvo movimientos— y sigue siendo `DELETE /interno/productos/:id`.
 */
const esquemaProducto = z.object({
  id: z.number().int().positive(),
  nombre: z.string().min(1).max(100),
  tipoConservacion: z.enum(TIPOS_CONSERVACION),
  activo: z.boolean(),
});

/** Manejador de `ProductoGuardado`. Un evento mal formado falla y va a la cola de fallidos. */
export async function productoGuardado(evento: Evento): Promise<void> {
  await productoModel.guardarReplica(esquemaProducto.parse(evento.datos));
}
