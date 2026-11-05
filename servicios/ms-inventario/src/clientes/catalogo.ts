import * as productoModel from '../models/producto.model.js';
import { ErrorApp } from '../errors/error-app.js';

/** Se lee en cada llamada (no al cargar el módulo): las pruebas pueden apuntarla a un catálogo falso. */
const url = () => process.env.CATALOGO_URL ?? 'http://ms-catalogo:4002';

/**
 * HU-09 · Cuántas recetas de ms-catalogo usan el insumo. Un insumo que forma
 * parte de una receta no se elimina (CU-INV-01); sin la respuesta del catálogo
 * no se puede saber, así que tampoco se elimina.
 */
export async function contarRecetasConInsumo(id: number): Promise<number> {
  try {
    const r = await fetch(`${url()}/interno/insumos/${id}/recetas`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return ((await r.json()) as { recetas: number }).recetas;
  } catch {
    throw new ErrorApp(
      503,
      'No se puede eliminar ahora: el servicio de catálogo no responde para confirmar que ninguna receta usa el insumo',
    );
  }
}

/**
 * Pone al día la réplica de productos pidiéndole la lista completa a
 * ms-catalogo. Se llama al arrancar: si un producto cambió mientras inventario
 * estaba apagado, aquí se recupera. Si catalogo no responde, reintenta.
 */
export async function sincronizarProductos(intentos = 20): Promise<void> {
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(`${url()}/interno/productos`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const productos = (await r.json()) as productoModel.DatosReplica[];
      for (const p of productos) await productoModel.guardarReplica(p);
      console.log(`ms-inventario: réplica de ${productos.length} productos al día`);
      return;
    } catch {
      await new Promise((ok) => setTimeout(ok, 3000));
    }
  }
  console.warn('ms-inventario: ms-catalogo no respondió; la réplica se actualizará con sus avisos');
}
