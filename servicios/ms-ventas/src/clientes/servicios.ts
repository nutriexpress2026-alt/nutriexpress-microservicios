import { env } from '../config/env.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * Llamadas de ms-ventas a otros servicios por REST interno (rutas /interno, que el
 * API Gateway no expone). Un servicio no lee la base de otro (RNF-ARQ-02): el
 * precio lo da el catálogo, el stock lo descuenta inventario, el cobro lo abre
 * ms-pagos y el cliente lo conoce ms-identidad. Son REST porque el vendedor
 * necesita la respuesta en el momento: hay stock o no, y cuál es el QR.
 */

async function llamar<T>(
  url: string,
  servicio: string,
  opciones: { metodo?: string; cuerpo?: unknown; esperaMs?: number } = {},
): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: opciones.metodo ?? 'GET',
      headers: opciones.cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
      // Inventario se da hasta 15 s para reservar y consumir: se espera lo mismo.
      signal: AbortSignal.timeout(opciones.esperaMs ?? 15000),
    });
  } catch {
    throw new ErrorApp(503, `El servicio de ${servicio} no responde. Intente de nuevo en unos minutos.`);
  }
  const datos = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new ErrorApp(r.status >= 500 ? 503 : r.status, datos.error ?? `${servicio} respondió ${r.status}`);
  return datos;
}

export interface Empleado {
  id: number;
  nombre: string;
  apellido: string;
}

/* --- ms-catalogo --- */

export interface PrecioProducto {
  id: number;
  nombre: string;
  precioVenta: number;
  activo: boolean;
}

/** RF-VEN-03 · «El precio lo pone el sistema»: el del catálogo ahora, nunca el del navegador. */
export const preciosDe = (ids: number[]) =>
  llamar<PrecioProducto[]>(`${env.catalogoUrl}/interno/productos/precios?ids=${ids.join(',')}`, 'catálogo');

/* --- ms-inventario (HU-17, HU-18, HU-19) --- */

export interface Existencias {
  idProducto: number;
  stockTotal: number;
  reservado?: number;
}

export const existencias = (ids: number[]) =>
  llamar<Existencias[]>(`${env.inventarioUrl}/interno/productos/existencias?ids=${ids.join(',')}`, 'inventario');

/** «Sin stock no se confirma»: inventario responde 409 diciendo qué falta. */
export const reservar = (id: string, productos: { idProducto: number; cantidad: number }[]) =>
  llamar<unknown>(`${env.inventarioUrl}/interno/reservas`, 'inventario', { metodo: 'POST', cuerpo: { id, origen: 'ms-ventas', productos } });

export const liberar = (id: string) =>
  llamar<unknown>(`${env.inventarioUrl}/interno/reservas/${encodeURIComponent(id)}/liberar`, 'inventario', { metodo: 'POST' });

export interface LineaVendida {
  idProducto: number;
  idAlmacen: number;
  almacen: string;
  cantidad: number;
  /** HU-28 · Costo promedio al salir del almacén (para la ganancia del reporte). */
  costoUnitario?: number;
}

/** RF-VEN-04 · «Al confirmar se descuenta el stock»: la reserva se consume con una nota de egreso por venta. */
export const consumir = (id: string, observacion: string, empleado: Empleado) =>
  llamar<{ idNotaEgreso: number | null; lineas: LineaVendida[]; yaConsumida: boolean }>(
    `${env.inventarioUrl}/interno/reservas/${encodeURIComponent(id)}/consumir`,
    'inventario',
    { metodo: 'POST', cuerpo: { observacion, empleado } },
  );

/** HU-19 · «Anular devuelve el stock»: a los almacenes de los que salió. Repetirlo no suma dos veces. */
export const devolver = (referencia: string, lineas: Omit<LineaVendida, 'almacen'>[], empleado: Empleado) =>
  llamar<{ idNotaIngreso: number }>(`${env.inventarioUrl}/interno/devoluciones`, 'inventario', {
    metodo: 'POST',
    cuerpo: { referencia, lineas, empleado },
  });

/* --- ms-pagos (HU-26) --- */

/** El cobro tal como lo devuelve ms-pagos (el frontend lo recibe sin cambios). */
export interface Cobro {
  id: number;
  estado: string;
  [otro: string]: unknown;
}

export const abrirCobro = (idVenta: number, monto: number) =>
  llamar<Cobro>(`${env.pagosUrl}/interno/pagos`, 'pagos', {
    metodo: 'POST',
    cuerpo: { idVenta, monto, metodo: 'QR', descripcion: `NutriExpress - Venta ${idVenta}` },
    esperaMs: 30000,
  });

export const registrarEfectivo = (idVenta: number, monto: number, quien: string) =>
  llamar<Cobro>(`${env.pagosUrl}/interno/pagos/efectivo`, 'pagos', { metodo: 'POST', cuerpo: { idVenta, monto, quien } });

/** HU-19 · El cobro de la venta anulada se cierra; si ya estaba pagado, queda una devolución pendiente. */
export const anularCobro = (idVenta: number, detalle: string) =>
  llamar<{ requiereDevolucion: boolean }>(`${env.pagosUrl}/interno/pagos/venta/${idVenta}/anular`, 'pagos', {
    metodo: 'POST',
    cuerpo: { detalle },
  });

/** El cobro de la venta, para mostrarlo; si ms-pagos no responde, la venta se muestra igual (RNF-DIS-01). */
export async function cobroDe(idVenta: number): Promise<Cobro | null> {
  try {
    return await llamar<Cobro | null>(`${env.pagosUrl}/interno/pagos/venta/${idVenta}`, 'pagos', { esperaMs: 8000 });
  } catch {
    return null;
  }
}

/* --- ms-identidad (HU-20) --- */

export const cliente = (id: number) =>
  llamar<{ id: number; nombreCompleto: string; activo: boolean }>(`${env.identidadUrl}/interno/clientes/${id}`, 'identidad', {
    esperaMs: 8000,
  });
