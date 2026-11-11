import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { anulaciones, cerrarServiciosFalsos, cobros, control, devoluciones, productos } from './servicios-falsos.js';
import { app } from '../src/app.js';
import { cerrarEventos, conectarEventos, eventosListos, publicar } from '../src/config/eventos.js';
import { registrarSuscripciones } from '../src/suscripciones.js';
import { registroDeEventos } from '../src/models/evento.model.js';
import { prisma } from '../src/config/prisma.js';
import amqp, { type ChannelModel } from 'amqplib';
import { INTERCAMBIO, type Evento } from '../src/config/eventos.js';

/** HU-18 venta de mostrador, HU-19 comprobante y anulación. */
const vendedor = cabecera({
  idUsuario: 3,
  nombre: 'Victor',
  apellido: 'Vendedor',
  rol: 'Empleado',
  cargo: 'Vendedor',
  permisos: ['VENTA_REGISTRAR', 'VENTA_LEER'],
});
const cliente = cabecera({ idUsuario: 40, rol: 'Cliente', cargo: null, permisos: ['PEDIDO_LEER', 'VENTA_LEER'] });

const vender = (cuerpo: object) => request(app).post('/api/ventas').set(vendedor).send(cuerpo);

async function esperar<T>(buscar: () => T | undefined | Promise<T | undefined>): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const v = await buscar();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('no ocurrió lo esperado');
}

let conexion: ChannelModel;
const fotos: Evento<{ idVenta: number; estado: string; vendedor: { id: number; nombre: string }; items: { idProducto: number; costoUnitario: number | null }[] }>[] = [];

beforeAll(async () => {
  registrarSuscripciones();
  await conectarEventos({ servicio: 'ms-ventas', registro: registroDeEventos });
  await eventosListos();
  // HU-28 · Lo que ms-reportes recibe: la foto de cada venta.
  conexion = await amqp.connect(process.env.RABBITMQ_URL!);
  const canal = await conexion.createChannel();
  await canal.assertExchange(INTERCAMBIO, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
  await canal.bindQueue(queue, INTERCAMBIO, 'VentaRegistrada');
  await canal.consume(queue, (m) => m && fotos.push(JSON.parse(m.content.toString())), { noAck: true });
});

afterAll(async () => {
  await conexion.close();
  await cerrarEventos();
  await cerrarServiciosFalsos();
  await cerrarServidorDeClave();
});

describe('HU-18 · Venta de mostrador', () => {
  it('en efectivo: el precio lo pone el sistema, el stock se descuenta y queda pagada', async () => {
    const r = await vender({ tipoVenta: 'Llevar', metodoPago: 'Efectivo', items: [{ idProducto: 1, cantidad: 2 }, { idProducto: 2, cantidad: 1 }] }).expect(201);
    expect(r.body).toMatchObject({ tipoVenta: 'Llevar', metodoPago: 'Efectivo', estadoPago: 'Pagado', total: 85.5, cliente: null });
    expect(r.body.atendidoPor).toEqual({ id: 3, nombreCompleto: 'Victor Vendedor' });
    expect(r.body.items).toContainEqual({ idProducto: 1, nombre: 'Ensalada Cesar con pollo', almacen: 'Camara Refrigerada', cantidad: 2, precioUnitario: 35, subtotal: 70 });
    expect(productos.get(1)!.stock).toBe(8);
    // El efectivo queda registrado en ms-pagos.
    expect(cobros.get(r.body.id)).toMatchObject({ metodo: 'Efectivo', estado: 'Pagado', monto: 85.5 });
  });

  it('sin stock no se confirma, y dice qué producto falta', async () => {
    const antes = await prisma.venta.count();
    const r = await vender({ metodoPago: 'Efectivo', items: [{ idProducto: 2, cantidad: 50 }] }).expect(409);
    expect(r.body.error).toMatch(/Jugo verde: se necesitan 50 u/);
    expect(await prisma.venta.count()).toBe(antes);
  });

  it('con un cliente registrado, la venta lo lleva; uno que no existe se rechaza', async () => {
    const r = await vender({ metodoPago: 'Efectivo', idCliente: 40, items: [{ idProducto: 2, cantidad: 1 }] }).expect(201);
    expect(r.body.cliente).toEqual({ id: 40, nombreCompleto: 'Camila Cliente' });
    await vender({ metodoPago: 'Efectivo', idCliente: 99, items: [{ idProducto: 2, cantidad: 1 }] }).expect(404);
  });

  it('en el mostrador no se cobra con tarjeta', async () => {
    await vender({ metodoPago: 'Tarjeta', items: [{ idProducto: 1, cantidad: 1 }] }).expect(400);
  });

  it('solo el personal vende', async () => {
    await request(app).post('/api/ventas').set(cliente).send({ metodoPago: 'Efectivo', items: [{ idProducto: 1, cantidad: 1 }] }).expect(403);
  });

  it('con QR queda pendiente hasta que se acredita (PagoConfirmado)', async () => {
    const r = await vender({ metodoPago: 'QR', items: [{ idProducto: 1, cantidad: 1 }] }).expect(201);
    expect(r.body).toMatchObject({ estadoPago: 'Pendiente', cobro: { estado: 'Pendiente', qrImagen: expect.stringMatching(/^data:image/) } });
    await publicar('PagoConfirmado', { idPago: r.body.cobro.id, idPedido: null, idVenta: r.body.id });
    await esperar(async () => (await prisma.venta.findUnique({ where: { id_venta: r.body.id } }))?.estado_pago === 'Pagado' || undefined);
  });

  it('si el QR vence (PagoFallido), la venta se anula y el stock vuelve', async () => {
    const stock = productos.get(1)!.stock;
    const r = await vender({ metodoPago: 'QR', items: [{ idProducto: 1, cantidad: 1 }] }).expect(201);
    expect(productos.get(1)!.stock).toBe(stock - 1);
    await publicar('PagoFallido', { idPago: r.body.cobro.id, idPedido: null, idVenta: r.body.id });
    await esperar(async () => (await prisma.venta.findUnique({ where: { id_venta: r.body.id } }))?.estado_pago === 'Anulado' || undefined);
    expect(productos.get(1)!.stock).toBe(stock);
  });

  it('si ms-pagos no puede abrir el QR, la venta no queda y el stock vuelve', async () => {
    const stock = productos.get(2)!.stock;
    control.pagosCaido = true;
    try {
      const r = await vender({ metodoPago: 'QR', items: [{ idProducto: 2, cantidad: 1 }] }).expect(503);
      expect(r.body.error).toMatch(/cobre en efectivo/);
      expect(productos.get(2)!.stock).toBe(stock);
    } finally {
      control.pagosCaido = false;
    }
  });

  it('la evaluación dice si alcanza el stock, sin producción al instante', async () => {
    const r = await request(app).post('/api/ventas/evaluacion').set(vendedor).send({ items: [{ idProducto: 2, cantidad: 100 }] }).expect(200);
    expect(r.body).toMatchObject({ puedeVenderse: false, requiereProduccion: false });
    expect(r.body.lineas[0]).toMatchObject({ idProducto: 2, solicitado: 100, faltante: 100 - productos.get(2)!.stock });
    await request(app).post('/api/ventas/con-produccion').set(vendedor).send({}).expect(409);
  });
});

describe('HU-28 · La venta para los reportes', () => {
  it('guarda el costo de lo vendido y publica la foto completa', async () => {
    const { body } = await vender({ metodoPago: 'Efectivo', items: [{ idProducto: 1, cantidad: 1 }, { idProducto: 2, cantidad: 2 }] }).expect(201);
    const detalle = await prisma.detalle_venta.findMany({ where: { id_venta: body.id }, orderBy: { id_producto: 'asc' } });
    expect(detalle.map((d) => Number(d.costo_unitario))).toEqual([20, 6]);
    const foto = await esperar(() => fotos.find((e) => e.datos.idVenta === body.id));
    expect(foto.datos).toMatchObject({ estado: 'Pagado', vendedor: { id: 3, nombre: 'Victor Vendedor' } });
    expect(foto.datos.items).toEqual([
      expect.objectContaining({ idProducto: 1, costoUnitario: 20 }),
      expect.objectContaining({ idProducto: 2, costoUnitario: 6 }),
    ]);
  });

  it('ms-reportes puede pedir todas las ventas (REST interno)', async () => {
    const r = await request(app).get('/interno/ventas/reporte').expect(200);
    expect(r.body.length).toBe(await prisma.venta.count());
    expect(r.body[0]).toMatchObject({ idVenta: expect.any(Number), vendedor: { id: 3 }, actualizadoEn: expect.any(String) });
    await request(app).get('/interno/ventas/reporte').set('X-Forwarded-For', '1.2.3.4').expect(404);
  });
});

describe('HU-19 · Comprobante y anulación', () => {
  it('el comprobante muestra productos, total y método', async () => {
    const { body } = await vender({ metodoPago: 'Efectivo', items: [{ idProducto: 1, cantidad: 1 }] });
    const r = await request(app).get(`/api/ventas/${body.id}/comprobante`).set(vendedor).expect(200);
    expect(r.body).toMatchObject({
      numero: `V-${String(body.id).padStart(6, '0')}`,
      metodoPago: 'Efectivo',
      cliente: 'Consumidor final',
      atendidoPor: 'Victor Vendedor',
      cantidadItems: 1,
      total: 35,
    });
  });

  it('anular devuelve el stock y, si estaba cobrada, avisa que hay que devolver el dinero', async () => {
    const { body } = await vender({ metodoPago: 'Efectivo', items: [{ idProducto: 2, cantidad: 3 }] });
    const stock = productos.get(2)!.stock;
    const r = await request(app).post(`/api/ventas/${body.id}/anular`).set(vendedor).send({ motivo: 'Se cobró dos veces' }).expect(200);
    expect(r.body).toMatchObject({ venta: { estadoPago: 'Anulado' }, requiereDevolucion: true });
    expect(r.body.aviso).toMatch(/devolverle el dinero/);
    expect(productos.get(2)!.stock).toBe(stock + 3);
    expect(devoluciones.find((d) => d.referencia === `Venta ${body.id} anulada`)!.lineas).toEqual([{ idProducto: 2, idAlmacen: 2, cantidad: 3 }]);
    expect(anulaciones.find((a) => a.idVenta === body.id)!.detalle).toMatch(/Se cobró dos veces/);
    // Anular otra vez no devuelve el stock dos veces.
    await request(app).post(`/api/ventas/${body.id}/anular`).set(vendedor).send({ motivo: 'Otra vez' }).expect(409);
    expect(productos.get(2)!.stock).toBe(stock + 3);
  });

  it('el historial lista las ventas y se filtra por tipo', async () => {
    const r = await request(app).get('/api/ventas?tipo=Llevar').set(vendedor).expect(200);
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.datos.every((v: { tipoVenta: string }) => v.tipoVenta === 'Llevar')).toBe(true);
  });

  it('cuenta las ventas de cada cliente para su ficha (REST interno)', async () => {
    const r = await request(app).get('/interno/ventas/conteo?clientes=40,41').expect(200);
    expect(r.body).toEqual({ 40: 1 });
    await request(app).get('/interno/ventas/conteo').set('X-Forwarded-For', '1.2.3.4').expect(404);
  });
});
