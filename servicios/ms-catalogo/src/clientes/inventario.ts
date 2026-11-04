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
/** Se lee en cada llamada (no al cargar el módulo): las pruebas pueden apuntarla a un inventario falso. */
const url = () => process.env.INVENTARIO_URL ?? 'http://ms-inventario:4003';

/* HU-10 · Reservas de insumos para producir (HU-17, rutas /interno/reservas de inventario). */

export interface LineaPrevision {
  idIngrediente: number;
  nombre: string;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
}

export interface PrevisionInventario {
  insumos: LineaPrevision[];
  costoInsumos: number;
  almacenDestino: { id: number; nombre: string } | null;
}

export interface ReservaInventario extends PrevisionInventario {
  id: string;
  estado: string;
}

/**
 * Llama a una ruta interna de inventario que necesita respuesta en el momento.
 * Los rechazos de inventario (409 sin stock, 404) llegan con su mensaje; si no
 * responde, 503.
 */
async function pedir<T>(ruta: string, cuerpo: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${url()}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      // Inventario se da hasta 15 s para reservar (reserva.service.ts): esperar lo mismo.
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ErrorApp(503, 'El servicio de inventario no responde: no se puede confirmar el stock de los insumos. Intente de nuevo.');
  }
  const datos = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new ErrorApp(r.status >= 500 ? 503 : r.status, datos.error ?? `Inventario respondió ${r.status}`);
  return datos;
}

/** ¿Alcanzan los insumos? Sin reservar (para registrar una orden). */
export const verificarInsumos = (insumos: { idIngrediente: number; cantidad: number }[]) =>
  pedir<PrevisionInventario>('/interno/reservas/verificar', { insumos });

/** Reserva los insumos de una orden (y resuelve adónde entra el producto terminado). */
export const reservar = (pedido: {
  id: string;
  origen: string;
  insumos: { idIngrediente: number; cantidad: number }[];
  destino: { idProducto: number; idAlmacen: number | null } | null;
}) => pedir<ReservaInventario>('/interno/reservas', pedido);

/** Devuelve lo reservado al disponible. Sin respuesta, no hace nada: es una limpieza. */
export async function liberar(id: string): Promise<void> {
  try {
    await fetch(`${url()}/interno/reservas/${encodeURIComponent(id)}/liberar`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    console.error(`ms-catalogo: no se pudo liberar la reserva ${id} en inventario`);
  }
}

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
    const r = await fetch(`${url()}/interno/productos/existencias?ids=${ids.join(',')}`, {
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
    r = await fetch(`${url()}/interno/productos/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) });
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
      const r = await fetch(`${url()}/interno/insumos`, { signal: AbortSignal.timeout(5000) });
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