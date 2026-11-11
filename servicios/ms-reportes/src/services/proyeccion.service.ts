import { z } from 'zod';
import { env } from '../config/env.js';
import type { Evento } from '../config/eventos.js';
import { esquemaFotoPedido, esquemaFotoVenta } from '../dtos/reporte.dto.js';
import * as proyeccion from '../models/proyeccion.model.js';
import * as avisoService from './aviso.service.js';

/**
 * Sprint 6 · Mantener al día la copia de ventas y pedidos de ms-reportes.
 *
 * Dos caminos, como las réplicas de los Sprints 2 y 3:
 * - **Por eventos** (lo normal): `VentaRegistrada` y `PedidoEstadoCambiado`
 *   traen la foto completa. Con la del pedido, además, se decide si hay que
 *   avisarle al cliente (HU-32).
 * - **La lista completa al arrancar**: si ms-reportes estuvo apagado, o un
 *   evento se perdió, al arrancar pide todas las fotos por REST interno. Esa
 *   pasada no manda correos: serían avisos atrasados.
 *
 * En los dos casos una foto vieja no pisa a una nueva (`actualizadoEn`).
 */

/** Manejador de `VentaRegistrada` (HU-28). */
export async function ventaRegistrada(evento: Evento): Promise<void> {
  await proyeccion.aplicarVenta(esquemaFotoVenta.parse(evento.datos));
}

/** Manejador de `PedidoEstadoCambiado` (HU-29 y HU-32). */
export async function pedidoEstadoCambiado(evento: Evento): Promise<void> {
  const foto = esquemaFotoPedido.parse(evento.datos);
  const { anterior, aplicada } = await proyeccion.aplicarPedido(foto);
  // Una foto atrasada no avisa nada: el cliente ya recibió lo que vino después.
  if (aplicada) await avisoService.anotarSiCorresponde(evento.id, anterior, foto);
}

async function traer<T>(url: string, esquema: z.ZodType<T>): Promise<T[]> {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`respondió ${r.status}`);
  return z.array(esquema).parse(await r.json());
}

/**
 * Pide a ms-ventas y a ms-pedidos la foto de todo lo que tienen. Si uno no
 * responde, se reintenta a los 30 s (el servicio puede estar arrancando); los
 * reportes funcionan mientras tanto con lo que haya llegado por eventos.
 */
export async function sincronizar(intento = 1): Promise<void> {
  const tareas = [
    { nombre: 'ventas', hacer: async () => (await traer(`${env.ventasUrl}/interno/ventas/reporte`, esquemaFotoVenta)).map((f) => proyeccion.aplicarVenta(f)) },
    { nombre: 'pedidos', hacer: async () => (await traer(`${env.pedidosUrl}/interno/pedidos/reporte`, esquemaFotoPedido)).map((f) => proyeccion.aplicarPedido(f)) },
  ];
  const fallidas: string[] = [];
  for (const t of tareas) {
    try {
      const n = (await Promise.all(await t.hacer())).length;
      console.log(`ms-reportes: copia de ${t.nombre} al día (${n})`);
    } catch (e) {
      fallidas.push(t.nombre);
      console.error(`ms-reportes: no se pudo traer la lista de ${t.nombre} (${(e as Error).message})`);
    }
  }
  if (fallidas.length > 0 && intento < 10) {
    setTimeout(() => void sincronizar(intento + 1), 30_000).unref();
  }
}
