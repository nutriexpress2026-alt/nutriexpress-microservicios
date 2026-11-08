/**
 * ms-catalogo, ms-inventario, ms-pagos y ms-identidad falsos para las pruebas de
 * ms-ventas: responden sus rutas /interno como los reales, con datos que cada
 * prueba controla. Las direcciones están en .env.test.
 */
import { createServer, type IncomingMessage } from 'node:http';

const PUERTO = 4997;

export const productos = new Map<number, { nombre: string; precio: number; activo: boolean; stock: number }>([
  [1, { nombre: 'Ensalada Cesar con pollo', precio: 35, activo: true, stock: 10 }],
  [2, { nombre: 'Jugo verde', precio: 15.5, activo: true, stock: 10 }],
]);

/** Reservas pedidas y su estado; lo vendido y lo devuelto, para comprobar el stock. */
export const reservas = new Map<string, { estado: string; productos: { idProducto: number; cantidad: number }[] }>();
export const devoluciones: { referencia: string; lineas: { idProducto: number; idAlmacen: number; cantidad: number }[] }[] = [];
export const cobros = new Map<number, { id: number; estado: string; metodo: string; monto: number }>();
export const anulaciones: { idVenta: number; detalle: string }[] = [];
export const control = { pagosCaido: false };
let siguienteCobro = 700;

async function cuerpo(req: IncomingMessage): Promise<any> {
  let texto = '';
  for await (const parte of req) texto += parte;
  return texto ? JSON.parse(texto) : {};
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PUERTO}`);
  const responder = (estado: number, datos: unknown) => {
    res.writeHead(estado, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(datos));
  };
  const ruta = url.pathname;

  if (ruta === '/catalogo/interno/productos/precios') {
    const ids = (url.searchParams.get('ids') ?? '').split(',').map(Number);
    return responder(200, ids.filter((id) => productos.has(id)).map((id) => ({ id, nombre: productos.get(id)!.nombre, precioVenta: productos.get(id)!.precio, activo: productos.get(id)!.activo })));
  }
  if (ruta === '/inventario/interno/productos/existencias') {
    const ids = (url.searchParams.get('ids') ?? '').split(',').map(Number);
    return responder(200, ids.map((id) => ({ idProducto: id, stockTotal: productos.get(id)?.stock ?? 0, reservado: 0 })));
  }
  if (req.method === 'POST' && ruta === '/inventario/interno/reservas') {
    const d = await cuerpo(req);
    const falta = (d.productos as { idProducto: number; cantidad: number }[]).find((l) => l.cantidad > (productos.get(l.idProducto)?.stock ?? 0));
    if (falta) return responder(409, { error: `Stock insuficiente: ${productos.get(falta.idProducto)!.nombre}: se necesitan ${falta.cantidad} u y hay ${productos.get(falta.idProducto)!.stock} u disponibles` });
    reservas.set(d.id, { estado: 'Activa', productos: d.productos });
    return responder(201, { id: d.id });
  }
  const consumir = /^\/inventario\/interno\/reservas\/([^/]+)\/consumir$/.exec(ruta);
  if (req.method === 'POST' && consumir) {
    const r = reservas.get(decodeURIComponent(consumir[1]))!;
    if (r.estado === 'Consumida') return responder(200, { idNotaEgreso: null, lineas: [], yaConsumida: true });
    r.estado = 'Consumida';
    for (const l of r.productos) productos.get(l.idProducto)!.stock -= l.cantidad;
    return responder(200, { idNotaEgreso: 90, lineas: r.productos.map((l) => ({ ...l, idAlmacen: 2, almacen: 'Camara Refrigerada' })), yaConsumida: false });
  }
  const liberar = /^\/inventario\/interno\/reservas\/([^/]+)\/liberar$/.exec(ruta);
  if (req.method === 'POST' && liberar) {
    const r = reservas.get(decodeURIComponent(liberar[1]));
    if (r) r.estado = 'Liberada';
    return responder(200, { estado: 'Liberada' });
  }
  if (req.method === 'POST' && ruta === '/inventario/interno/devoluciones') {
    const d = await cuerpo(req);
    if (!devoluciones.some((x) => x.referencia === d.referencia)) {
      devoluciones.push({ referencia: d.referencia, lineas: d.lineas });
      for (const l of d.lineas) productos.get(l.idProducto)!.stock += l.cantidad;
    }
    return responder(201, { idNotaIngreso: 91 });
  }
  if (req.method === 'POST' && ruta === '/pagos/interno/pagos') {
    if (control.pagosCaido) return responder(502, { error: 'sin conexión con la pasarela' });
    const d = await cuerpo(req);
    const cobro = { id: siguienteCobro++, estado: 'Pendiente', metodo: d.metodo, monto: d.monto, qrImagen: 'data:image/png;base64,AAAA', idVenta: d.idVenta };
    cobros.set(d.idVenta, cobro);
    return responder(201, cobro);
  }
  if (req.method === 'POST' && ruta === '/pagos/interno/pagos/efectivo') {
    const d = await cuerpo(req);
    const cobro = { id: siguienteCobro++, estado: 'Pagado', metodo: 'Efectivo', monto: d.monto, idVenta: d.idVenta };
    cobros.set(d.idVenta, cobro);
    return responder(201, cobro);
  }
  const deVenta = /^\/pagos\/interno\/pagos\/venta\/(\d+)$/.exec(ruta);
  if (req.method === 'GET' && deVenta) return responder(200, cobros.get(Number(deVenta[1])) ?? null);
  const anular = /^\/pagos\/interno\/pagos\/venta\/(\d+)\/anular$/.exec(ruta);
  if (req.method === 'POST' && anular) {
    const idVenta = Number(anular[1]);
    anulaciones.push({ idVenta, detalle: (await cuerpo(req)).detalle });
    const c = cobros.get(idVenta);
    const requiereDevolucion = c?.estado === 'Pagado';
    if (c) c.estado = requiereDevolucion ? 'Reembolsado' : 'Fallido';
    return responder(200, { requiereDevolucion });
  }
  const cliente = /^\/identidad\/interno\/clientes\/(\d+)$/.exec(ruta);
  if (cliente) {
    const id = Number(cliente[1]);
    if (id === 40) return responder(200, { id, nombreCompleto: 'Camila Cliente', activo: true });
    return responder(404, { error: 'El cliente indicado no existe' });
  }
  responder(404, { error: `Ruta falsa no encontrada: ${req.method} ${ruta}` });
});

await new Promise<void>((ok) => servidor.listen(PUERTO, '127.0.0.1', ok));
export const cerrarServiciosFalsos = () => new Promise((ok) => servidor.close(ok));
