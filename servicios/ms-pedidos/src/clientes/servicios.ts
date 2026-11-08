import { env } from '../config/env.js';
import { ErrorApp } from '../errors/error-app.js';
import type { MetodoPago } from '../config/dominio.js';

/**
 * Llamadas de ms-pedidos a otros servicios por REST interno (rutas /interno,
 * que el API Gateway no expone). Un servicio no lee la base de otro
 * (RNF-ARQ-02): el precio lo pide al catálogo, el stock lo reserva inventario y
 * el cobro lo abre ms-pagos. Se usa REST y no un evento porque el cliente
 * necesita la respuesta en el momento: si hay stock y cuál es su QR.
 */

/** Respuesta de un servicio, o el error que corresponde si no respondió o rechazó. */
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
      // Inventario se da hasta 15 s para reservar (reserva.service.ts): se espera lo mismo.
      signal: AbortSignal.timeout(opciones.esperaMs ?? 15000),
    });
  } catch {
    throw new ErrorApp(503, `El servicio de ${servicio} no responde. Intente de nuevo en unos minutos.`);
  }
  const datos = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) {
    // Los rechazos (409 sin stock, 404) llegan con su mensaje; una falla del otro lado, 503.
    throw new ErrorApp(r.status >= 500 ? 503 : r.status, datos.error ?? `${servicio} respondió ${r.status}`);
  }
  return datos;
}

/* --- ms-catalogo --- */

export interface PrecioProducto {
  id: number;
  nombre: string;
  precioVenta: number;
  activo: boolean;
}

/** RNF-SEG-03 · El precio lo fija el servidor: el del catálogo en este momento, nunca el del navegador. */
export const preciosDe = (ids: number[]) =>
  llamar<PrecioProducto[]>(`${env.catalogoUrl}/interno/productos/precios?ids=${ids.join(',')}`, 'catálogo');

/* --- ms-inventario (HU-17) --- */

/**
 * HU-21 · «Se reserva el stock al confirmar; si falta stock se informa qué
 * producto»: inventario responde 409 con el detalle de lo que falta.
 */
export const reservar = (id: string, productos: { idProducto: number; cantidad: number }[]) =>
  llamar<unknown>(`${env.inventarioUrl}/interno/reservas`, 'inventario', {
    metodo: 'POST',
    cuerpo: { id, origen: 'ms-pedidos', productos },
  });

/** Devuelve lo reservado al disponible. Liberar dos veces no es un error. */
export const liberar = (id: string) =>
  llamar<unknown>(`${env.inventarioUrl}/interno/reservas/${encodeURIComponent(id)}/liberar`, 'inventario', {
    metodo: 'POST',
  });

/** HU-24 · Entregar consume la reserva: nota de egreso con motivo Venta. Repetirlo no descuenta dos veces. */
export const consumir = (id: string, observacion: string, empleado: { id: number; nombre: string; apellido: string }) =>
  llamar<unknown>(`${env.inventarioUrl}/interno/reservas/${encodeURIComponent(id)}/consumir`, 'inventario', {
    metodo: 'POST',
    cuerpo: { observacion, empleado },
  });

/* --- ms-identidad (HU-23) --- */

export interface Repartidor {
  id: number;
  nombre: string;
  apellido: string;
  telefono: string | null;
}

/** Los empleados con cargo Repartidor activos. */
export const repartidores = () => llamar<Repartidor[]>(`${env.identidadUrl}/interno/repartidores`, 'identidad', { esperaMs: 8000 });

/** Un empleado con su cargo, para validar a quién se asigna un pedido. */
export const empleado = (id: number) =>
  llamar<{ id: number; nombre: string; apellido: string; cargo: string; activo: boolean }>(
    `${env.identidadUrl}/interno/empleados/${id}`,
    'identidad',
    { esperaMs: 8000 },
  );

/* --- ms-pagos (HU-26) --- */

/** HU-24 · «Entregar cobra el efectivo»: el cobro queda registrado en ms-pagos como Pagado. */
export const registrarEfectivo = (idPedido: number, monto: number, quien: string) =>
  llamar<Cobro>(`${env.pagosUrl}/interno/pagos/efectivo`, 'pagos', { metodo: 'POST', cuerpo: { idPedido, monto, quien } });

/** El cobro tal como lo devuelve ms-pagos (el frontend lo recibe sin cambios). */
export interface Cobro {
  id: number;
  estado: string;
  referenciaExterna: string | null;
  confirmadoEn: string | null;
  [otro: string]: unknown;
}

export const abrirCobro = (datos: {
  idPedido: number;
  monto: number;
  metodo: MetodoPago;
  descripcion: string;
  cliente: { nombre: string };
}) => llamar<Cobro>(`${env.pagosUrl}/interno/pagos`, 'pagos', { metodo: 'POST', cuerpo: datos, esperaMs: 30000 });

/**
 * El cobro del pedido, para mostrarlo con el QR. Si ms-pagos no responde, el
 * pedido se muestra igual, sin cobro (RNF-DIS-01).
 */
export async function cobroDe(idPedido: number): Promise<Cobro | null> {
  try {
    return await llamar<Cobro | null>(`${env.pagosUrl}/interno/pagos/pedido/${idPedido}`, 'pagos', { esperaMs: 8000 });
  } catch {
    return null;
  }
}
