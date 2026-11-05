/**
 * ms-catalogo, ms-inventario y ms-pagos falsos para las pruebas de ms-pedidos:
 * responden sus rutas /interno como los reales, con datos que cada prueba
 * controla. Así las pruebas no dependen de que esos servicios estén levantados.
 * Las direcciones están en .env.test (CATALOGO_URL, INVENTARIO_URL, PAGOS_URL).
 */
import { createServer, type IncomingMessage } from 'node:http';

const PUERTO = 4998;

export const productos = new Map<number, { nombre: string; precio: number; activo: boolean; stock: number }>([
  [1, { nombre: 'Ensalada Cesar con pollo', precio: 35, activo: true, stock: 20 }],
  [2, { nombre: 'Jugo verde', precio: 15.5, activo: true, stock: 20 }],
  [3, { nombre: 'Wrap discontinuado', precio: 28, activo: false, stock: 20 }],
]);

/** Reservas que pidió ms-pedidos, por id. */
export const reservas = new Map<string, { estado: 'Activa' | 'Liberada'; productos: { idProducto: number; cantidad: number }[] }>();

/** Cobros que abrió ms-pedidos, por pedido. `pagosCaido` simula ms-pagos sin responder. */
export const cobros = new Map<number, { id: number; estado: string; referenciaExterna: string | null; confirmadoEn: string | null }>();
export const control = { pagosCaido: false };
let siguienteCobro = 500;

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

  if (req.method === 'GET' && url.pathname === '/catalogo/interno/productos/precios') {
    const ids = (url.searchParams.get('ids') ?? '').split(',').map(Number);
    return responder(
      200,
      ids.filter((id) => productos.has(id)).map((id) => {
        const p = productos.get(id)!;
        return { id, nombre: p.nombre, precioVenta: p.precio, activo: p.activo };
      }),
    );
  }

  if (req.method === 'POST' && url.pathname === '/inventario/interno/reservas') {
    const datos = await cuerpo(req);
    const faltan = (datos.productos as { idProducto: number; cantidad: number }[]).filter(
      (l) => l.cantidad > (productos.get(l.idProducto)?.stock ?? 0),
    );
    if (faltan.length > 0) {
      const p = productos.get(faltan[0].idProducto)!;
      return responder(409, { error: `Stock insuficiente: ${p.nombre}: se necesitan ${faltan[0].cantidad} y hay ${p.stock} disponibles` });
    }
    reservas.set(datos.id, { estado: 'Activa', productos: datos.productos });
    return responder(201, { id: datos.id, estado: 'Activa' });
  }

  const liberar = /^\/inventario\/interno\/reservas\/([^/]+)\/liberar$/.exec(url.pathname);
  if (req.method === 'POST' && liberar) {
    const reserva = reservas.get(decodeURIComponent(liberar[1]));
    if (!reserva) return responder(404, { error: 'La reserva no existe' });
    reserva.estado = 'Liberada';
    return responder(200, { estado: 'Liberada' });
  }

  if (req.method === 'POST' && url.pathname === '/pagos/interno/pagos') {
    if (control.pagosCaido) return responder(502, { error: 'No se pudo abrir el cobro en la pasarela: sin conexión' });
    const datos = await cuerpo(req);
    const cobro = {
      id: siguienteCobro++,
      estado: 'Pendiente',
      metodo: datos.metodo,
      monto: datos.monto,
      tipoDatos: datos.metodo === 'QR' ? 'qr' : 'url',
      qrImagen: 'data:image/png;base64,AAAA',
      referenciaExterna: `SIM-${datos.idPedido}`,
      confirmadoEn: null,
      idPedido: datos.idPedido,
      simulado: true,
    };
    cobros.set(datos.idPedido, cobro);
    return responder(201, cobro);
  }

  const dePedido = /^\/pagos\/interno\/pagos\/pedido\/(\d+)$/.exec(url.pathname);
  if (req.method === 'GET' && dePedido) {
    if (control.pagosCaido) return responder(503, { error: 'sin conexión' });
    return responder(200, cobros.get(Number(dePedido[1])) ?? null);
  }

  responder(404, { error: `Ruta falsa no encontrada: ${req.method} ${url.pathname}` });
});

await new Promise<void>((ok) => servidor.listen(PUERTO, '127.0.0.1', ok));
export const cerrarServiciosFalsos = () => new Promise((ok) => servidor.close(ok));
