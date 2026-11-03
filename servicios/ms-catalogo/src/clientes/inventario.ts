import { ErrorApp } from '../errors/error-app.js';

/**
 * Cliente REST de ms-inventario (RNF-ARQ-05, comunicación síncrona).
 *
 * El catálogo no lee las tablas de inventario (RNF-ARQ-02): las existencias y
 * el costo promedio de cada producto se los pide a ms-inventario por su ruta
 * interna, que el API Gateway no expone. A la inversa, cada alta o cambio de
 * producto se le avisa para que mantenga su réplica (producto) al día; desde el
 * Sprint 3 ese aviso pasa a ser un evento en RabbitMQ.
 */
const URL = process.env.INVENTARIO_URL ?? 'http://ms-inventario:4003';

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
    const r = await fetch(`${URL}/interno/productos/existencias?ids=${ids.join(',')}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const lista = (await r.json()) as ExistenciasProducto[];
    return new Map(lista.map((e) => [e.idProducto, e]));
  } catch {
    return null;
  }
}

export interface ProductoReplica {
  id: number;
  nombre: string;
  tipoConservacion: string;
  activo: boolean;
}

/** Crea o actualiza la réplica del producto en ms-inventario. */
export async function sincronizarProducto(p: ProductoReplica): Promise<void> {
  try {
    await fetch(`${URL}/interno/productos/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Si inventario no está, la réplica se pone al día cuando arranque: pide la
    // lista completa a /interno/productos de este servicio.
  }
}

/**
 * Pide a ms-inventario que quite la réplica de un producto que se va a
 * eliminar. Responde 409 si ya tuvo movimientos: entonces no se elimina.
 */
export async function quitarProducto(id: number): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`${URL}/interno/productos/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) });
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
