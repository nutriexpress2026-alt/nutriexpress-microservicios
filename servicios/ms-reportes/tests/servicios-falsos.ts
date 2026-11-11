/**
 * ms-identidad, ms-catalogo, ms-ventas y ms-pedidos falsos para las pruebas de
 * ms-reportes: responden sus rutas internas como los reales, con datos que cada
 * prueba controla. Las direcciones están en vitest.config.ts.
 */
import { createServer } from 'node:http';

const PUERTO = 4996;

/** Clientes de ms-identidad: el correo al que va cada aviso (HU-32). */
export const clientes = new Map<number, { email: string; nombreCompleto: string }>([
  [60, { email: 'camila@correo.bo', nombreCompleto: 'Camila Cliente' }],
]);
/** Lo que ms-ventas y ms-pedidos devuelven como lista completa al arrancar. */
export const listas: { ventas: unknown[]; pedidos: unknown[] } = { ventas: [], pedidos: [] };
export const control = { identidadCaida: false, inventarioCaido: false };
/** HU-30 · Lo que responden ms-catalogo (órdenes finalizadas) y ms-inventario (movimientos). */
export const operaciones: { ordenes: unknown[]; movimientos: unknown[]; existencias: unknown[]; consultas: string[] } = {
  ordenes: [],
  movimientos: [],
  existencias: [],
  consultas: [],
};

const servidor = createServer((req, res) => {
  const ruta = new URL(req.url ?? '/', `http://127.0.0.1:${PUERTO}`).pathname;
  const responder = (estado: number, datos: unknown) => {
    res.writeHead(estado, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(datos));
  };
  const cliente = /^\/identidad\/interno\/clientes\/(\d+)$/.exec(ruta);
  if (cliente) {
    if (control.identidadCaida) return responder(503, { error: 'caído' });
    const c = clientes.get(Number(cliente[1]));
    return c ? responder(200, { id: Number(cliente[1]), ...c, activo: true }) : responder(404, { error: 'El cliente indicado no existe' });
  }
  if (ruta === '/catalogo/api/negocio') return responder(200, { nombre: 'NutriExpress', correo: 'soporte@nutriexpress.bo' });
  if (ruta === '/catalogo/interno/ordenes/reporte') {
    operaciones.consultas.push(req.url ?? '');
    return responder(200, { producto: null, ordenes: operaciones.ordenes });
  }
  if (ruta === '/inventario/interno/movimientos/reporte') {
    operaciones.consultas.push(req.url ?? '');
    if (control.inventarioCaido) return responder(503, { error: 'caído' });
    return responder(200, { item: null, movimientos: operaciones.movimientos, existencias: operaciones.existencias });
  }
  if (ruta === '/ventas/interno/ventas/reporte') return responder(200, listas.ventas);
  if (ruta === '/pedidos/interno/pedidos/reporte') return responder(200, listas.pedidos);
  responder(404, { error: `Ruta falsa no encontrada: ${ruta}` });
});

await new Promise<void>((ok) => servidor.listen(PUERTO, '127.0.0.1', ok));
export const cerrarServiciosFalsos = () => new Promise((ok) => servidor.close(ok));
