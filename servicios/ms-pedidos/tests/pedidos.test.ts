import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import amqp, { type ChannelModel } from 'amqplib';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { cerrarServiciosFalsos, cobros, control, reservas } from './servicios-falsos.js';
import { app } from '../src/app.js';
import { cerrarEventos, conectarEventos, eventosListos, INTERCAMBIO, publicar, type Evento } from '../src/config/eventos.js';
import { registrarSuscripciones } from '../src/suscripciones.js';
import { registroDeEventos } from '../src/models/evento.model.js';
import { prisma } from '../src/config/prisma.js';

/**
 * HU-21 carrito y pedido, HU-22 direcciones, HU-25 mis pedidos y seguimiento,
 * HU-26 la parte de la saga del pago que le toca a ms-pedidos.
 */
const permisosCliente = ['PEDIDO_GESTIONAR', 'PEDIDO_LEER'];
const camila = cabecera({ idUsuario: 40, nombre: 'Camila', apellido: 'Cliente', rol: 'Cliente', cargo: null, permisos: permisosCliente });
const otroCliente = cabecera({ idUsuario: 41, nombre: 'Bruno', apellido: 'Vecino', rol: 'Cliente', cargo: null, permisos: permisosCliente });
const vendedor = cabecera({ idUsuario: 3, rol: 'Empleado', cargo: 'Vendedor', permisos: ['PEDIDO_LEER', 'PEDIDO_GESTIONAR'] });

const direccion = { calle: 'Avenida Banzer', numero: '1200', referencia: 'Portón verde, frente al parque' };

let conexion: ChannelModel;
const cancelados: Evento<{ idPedido: number; idReserva: string; motivo: string }>[] = [];

async function esperar<T>(buscar: () => T | undefined | Promise<T | undefined>): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const v = await buscar();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('no ocurrió lo esperado');
}

const pedir = (cab: Record<string, string>, cuerpo: object) => request(app).post('/api/pedidos').set(cab).send(cuerpo);

beforeAll(async () => {
  registrarSuscripciones();
  await conectarEventos({ servicio: 'ms-pedidos', registro: registroDeEventos });
  await eventosListos();
  conexion = await amqp.connect(process.env.RABBITMQ_URL!);
  const canal = await conexion.createChannel();
  await canal.assertExchange(INTERCAMBIO, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
  await canal.bindQueue(queue, INTERCAMBIO, 'PedidoCancelado');
  await canal.consume(queue, (m) => m && cancelados.push(JSON.parse(m.content.toString())), { noAck: true });
});

afterAll(async () => {
  await conexion.close();
  await cerrarEventos();
  await cerrarServiciosFalsos();
  await cerrarServidorDeClave();
});

describe('HU-22 · Direcciones de entrega', () => {
  it('la primera queda como principal y las coordenadas se guardan con seis decimales', async () => {
    const r = await request(app)
      .post('/api/ubicaciones')
      .set(camila)
      .send({ ...direccion, etiqueta: 'Casa', latitud: -17.78345678912, longitud: -63.18212345678 })
      .expect(201);
    expect(r.body).toMatchObject({ etiqueta: 'Casa', principal: true, latitud: -17.783457, longitud: -63.182123 });
  });

  it('otra puede pasar a ser la principal, y la principal se lista primero', async () => {
    const oficina = await request(app)
      .post('/api/ubicaciones')
      .set(camila)
      .send({ calle: 'Calle Libertad', numero: '45', referencia: 'Edificio azul, piso 3', etiqueta: 'Oficina' })
      .expect(201);
    expect(oficina.body.principal).toBe(false);

    await request(app).put(`/api/ubicaciones/${oficina.body.id}/principal`).set(camila).expect(200);
    const lista = await request(app).get('/api/ubicaciones').set(camila).expect(200);
    expect(lista.body.map((u: { etiqueta: string; principal: boolean }) => [u.etiqueta, u.principal])).toEqual([
      ['Oficina', true],
      ['Casa', false],
    ]);
  });

  it('las direcciones son de cada cliente: otro no las ve ni las toca', async () => {
    const [casa] = (await request(app).get('/api/ubicaciones').set(camila)).body;
    expect((await request(app).get('/api/ubicaciones').set(otroCliente)).body).toEqual([]);
    await request(app).delete(`/api/ubicaciones/${casa.id}`).set(otroCliente).expect(404);
  });

  it('el personal no tiene direcciones de entrega', async () => {
    await request(app).get('/api/ubicaciones').set(vendedor).expect(403);
  });

  it('una dirección sin referencia se rechaza', async () => {
    await request(app).post('/api/ubicaciones').set(camila).send({ calle: 'Calle 1', etiqueta: 'Casa' }).expect(400);
  });
});

describe('HU-21 · Carrito y pedido', () => {
  it('confirma en efectivo: el precio lo pone el catálogo y el stock queda reservado', async () => {
    const r = await pedir(camila, {
      metodoPago: 'Efectivo',
      ubicacion: direccion,
      // El mismo producto dos veces se suma en una línea.
      items: [
        { idProducto: 1, cantidad: 2 },
        { idProducto: 2, cantidad: 1 },
        { idProducto: 1, cantidad: 1 },
      ],
    }).expect(201);

    expect(r.body).toMatchObject({ estadoPedido: 'Recibido', estadoPago: 'Pendiente', metodoPago: 'Efectivo', total: 120.5, cobro: null });
    expect(r.body.items).toEqual([
      { idProducto: 1, nombre: 'Ensalada Cesar con pollo', cantidad: 3, precioUnitario: 35, subtotal: 105 },
      { idProducto: 2, nombre: 'Jugo verde', cantidad: 1, precioUnitario: 15.5, subtotal: 15.5 },
    ]);
    const pedido = await prisma.pedido.findUnique({ where: { id_pedido: r.body.id } });
    expect(reservas.get(pedido!.id_reserva)).toEqual({
      estado: 'Activa',
      productos: [
        { idProducto: 1, cantidad: 3 },
        { idProducto: 2, cantidad: 1 },
      ],
    });
  });

  it('si falta stock informa qué producto, y no se crea el pedido', async () => {
    const antes = await prisma.pedido.count();
    const r = await pedir(camila, { metodoPago: 'Efectivo', ubicacion: direccion, items: [{ idProducto: 2, cantidad: 30 }] }).expect(409);
    expect(r.body.error).toMatch(/Jugo verde: se necesitan 30 y hay 20/);
    expect(await prisma.pedido.count()).toBe(antes);
  });

  it('un producto dado de baja no se puede pedir', async () => {
    const r = await pedir(camila, { metodoPago: 'Efectivo', ubicacion: direccion, items: [{ idProducto: 3, cantidad: 1 }] }).expect(409);
    expect(r.body.error).toMatch(/Wrap discontinuado/);
  });

  it('solo un cliente hace pedidos', async () => {
    await pedir(vendedor, { metodoPago: 'Efectivo', ubicacion: direccion, items: [{ idProducto: 1, cantidad: 1 }] }).expect(403);
  });

  it('con una dirección guardada de otro cliente, no', async () => {
    const [casa] = (await request(app).get('/api/ubicaciones').set(camila)).body;
    await pedir(otroCliente, { metodoPago: 'Efectivo', ubicacion: { idUbicacion: casa.id }, items: [{ idProducto: 1, cantidad: 1 }] }).expect(404);
  });
});

describe('HU-26 · Pago en línea (saga del pedido)', () => {
  it('con QR el pedido espera su pago y trae el cobro para mostrar', async () => {
    const r = await pedir(camila, { metodoPago: 'QR', ubicacion: direccion, items: [{ idProducto: 1, cantidad: 1 }] }).expect(201);
    expect(r.body).toMatchObject({ estadoPedido: 'Pendiente de pago', cancelable: true });
    expect(r.body.cobro).toMatchObject({ estado: 'Pendiente', qrImagen: expect.stringMatching(/^data:image/) });
    const pedido = await prisma.pedido.findUnique({ where: { id_pedido: r.body.id } });
    expect(pedido!.id_pago).toBe(r.body.cobro.id);
  });

  it('PagoConfirmado pasa el pedido a Recibido (una sola vez aunque llegue repetido)', async () => {
    const { body } = await pedir(camila, { metodoPago: 'QR', ubicacion: direccion, items: [{ idProducto: 2, cantidad: 2 }] });
    const evento = await publicar('PagoConfirmado', { idPago: body.cobro.id, idPedido: body.id, referenciaExterna: 'SIM-123' });
    const pagado = await esperar(async () => {
      const p = await prisma.pedido.findUnique({ where: { id_pedido: body.id } });
      return p?.estado_pedido === 'Recibido' ? p : undefined;
    });
    expect(pagado).toMatchObject({ estado_pago: 'Pagado', referencia_pago: 'SIM-123' });
    // Queda anotado como procesado: si RabbitMQ lo entrega otra vez, no se aplica de nuevo.
    await esperar(() => registroDeEventos.yaProcesado(evento.id));
  });

  it('PagoFallido (vencido) cancela el pedido y pide liberar su reserva', async () => {
    const { body } = await pedir(camila, { metodoPago: 'Tarjeta', ubicacion: direccion, items: [{ idProducto: 1, cantidad: 1 }] });
    await publicar('PagoFallido', { idPago: body.cobro.id, idPedido: body.id, referenciaExterna: null });
    const cancelado = await esperar(async () => {
      const p = await prisma.pedido.findUnique({ where: { id_pedido: body.id } });
      return p?.estado_pedido === 'Cancelado' ? p : undefined;
    });
    expect(cancelado).toMatchObject({ motivo_cancelacion: 'Sin pago', estado_pago: 'Vencido' });
    const aviso = await esperar(() => cancelados.find((e) => e.datos.idPedido === body.id));
    expect(aviso.datos.idReserva).toBe(cancelado.id_reserva);
  });

  it('si ms-pagos no puede abrir el cobro, el pedido se deshace y el stock se libera', async () => {
    control.pagosCaido = true;
    try {
      const r = await pedir(camila, { metodoPago: 'QR', ubicacion: direccion, items: [{ idProducto: 1, cantidad: 1 }] }).expect(503);
      expect(r.body.error).toMatch(/pagar en efectivo/);
      const ultimo = await prisma.pedido.findFirst({ orderBy: { id_pedido: 'desc' } });
      expect(ultimo).toMatchObject({ estado_pedido: 'Cancelado', motivo_cancelacion: 'Sin pago' });
      await esperar(() => cancelados.find((e) => e.datos.idPedido === ultimo!.id_pedido));
    } finally {
      control.pagosCaido = false;
    }
  });

  it('si el aviso del pago se perdió, el pedido se pone al día al mirarlo', async () => {
    const { body } = await pedir(camila, { metodoPago: 'QR', ubicacion: direccion, items: [{ idProducto: 2, cantidad: 1 }] });
    // ms-pagos ya lo cobró, pero PagoConfirmado nunca llegó.
    Object.assign(cobros.get(body.id)!, { estado: 'Pagado', confirmadoEn: new Date().toISOString() });
    const r = await request(app).get(`/api/pedidos/${body.id}`).set(camila).expect(200);
    expect(r.body).toMatchObject({ estadoPedido: 'Recibido', estadoPago: 'Pagado' });

    // Con el pago confirmado ya hay comprobante.
    const c = await request(app).get(`/api/pedidos/${body.id}/comprobante`).set(camila).expect(200);
    expect(c.body).toMatchObject({ numero: `Pedido #${String(body.id).padStart(5, '0')}`, cliente: 'Camila Cliente', metodoPago: 'QR', total: 15.5 });
  });
});

describe('HU-25 · Mis pedidos, cancelar y seguimiento', () => {
  it('cada cliente ve solo sus pedidos', async () => {
    const mios = (await request(app).get('/api/pedidos').set(camila).expect(200)).body;
    expect(mios.length).toBeGreaterThan(0);
    expect((await request(app).get('/api/pedidos').set(otroCliente).expect(200)).body).toEqual([]);
    await request(app).get(`/api/pedidos/${mios[0].id}`).set(otroCliente).expect(404);
  });

  it('cancelar libera el stock; un pedido cancelado no se cancela otra vez', async () => {
    const { body } = await pedir(camila, { metodoPago: 'Efectivo', ubicacion: direccion, items: [{ idProducto: 1, cantidad: 1 }] });
    const r = await request(app).post(`/api/pedidos/${body.id}/cancelar`).set(camila).expect(200);
    expect(r.body).toMatchObject({ estadoPedido: 'Cancelado', motivoCancelacion: 'Cliente', cancelable: false });
    await esperar(() => cancelados.find((e) => e.datos.idPedido === body.id && e.datos.motivo === 'Cliente'));
    await request(app).post(`/api/pedidos/${body.id}/cancelar`).set(camila).expect(409);
  });

  it('un pedido en camino ya no se cancela', async () => {
    const { body } = await pedir(camila, { metodoPago: 'Efectivo', ubicacion: direccion, items: [{ idProducto: 2, cantidad: 1 }] });
    await prisma.pedido.update({ where: { id_pedido: body.id }, data: { estado_pedido: 'En camino' } });
    const r = await request(app).post(`/api/pedidos/${body.id}/cancelar`).set(camila).expect(409);
    expect(r.body.error).toMatch(/En camino/);
  });

  it('la posición del repartidor solo se ve con el pedido en camino', async () => {
    const { body } = await pedir(camila, { metodoPago: 'Efectivo', ubicacion: direccion, items: [{ idProducto: 1, cantidad: 1 }] });
    const antes = await request(app).get(`/api/pedidos/${body.id}/seguimiento`).set(camila).expect(200);
    expect(antes.body).toEqual({ enCamino: false, repartidor: null, posicion: null });

    // Lo que hará el Sprint 5: asignar un repartidor que comparte su ubicación.
    await prisma.posicion_repartidor.upsert({
      where: { id_empleado: 7 },
      create: { id_empleado: 7, latitud: -17.7801, longitud: -63.1802, precision_m: 12 },
      update: {},
    });
    await prisma.pedido.update({
      where: { id_pedido: body.id },
      data: { estado_pedido: 'En camino', id_repartidor: 7, repartidor_nombre: 'Rodrigo Reparto' },
    });
    const r = await request(app).get(`/api/pedidos/${body.id}/seguimiento`).set(camila).expect(200);
    expect(r.body).toMatchObject({ enCamino: true, repartidor: 'Rodrigo', posicion: { latitud: -17.7801, longitud: -63.1802, precision: 12 } });
  });

  it('el comprobante existe solo con el pago confirmado', async () => {
    const { body } = await pedir(camila, { metodoPago: 'Efectivo', ubicacion: direccion, items: [{ idProducto: 1, cantidad: 1 }] });
    await request(app).get(`/api/pedidos/${body.id}/comprobante`).set(camila).expect(409);
  });
});
