import * as productoModel from '../models/producto.model.js';

const URL = process.env.CATALOGO_URL ?? 'http://ms-catalogo:4002';

/**
 * Pone al día la réplica de productos pidiéndole la lista completa a
 * ms-catalogo. Se llama al arrancar: si un producto cambió mientras inventario
 * estaba apagado, aquí se recupera. Si catalogo no responde, reintenta.
 */
export async function sincronizarProductos(intentos = 20): Promise<void> {
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(`${URL}/interno/productos`, { signal: AbortSignal.timeout(5000) });
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
