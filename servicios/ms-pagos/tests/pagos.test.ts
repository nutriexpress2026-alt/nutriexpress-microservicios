import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import amqp, { type ChannelModel } from 'amqplib';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { app } from '../src/app.js';
import { cerrarEventos, conectarEventos, eventosListos, INTERCAMBIO, publicar, type Evento } from '../src/config/eventos.js';
import { registrarSuscripciones } from '../src/suscripciones.js';
import { registroDeEventos } from '../src/models/evento.model.js';
import { prisma } from '../src/config/prisma.js';
import { vencerPendientes } from '../src/services/pago.service.js';
import { invalidarCache } from '../src/services/configuracion.service.js';

/**
 * HU-26 · Cobro en línea del pedido con QR o tarjeta, y su desenlace publicado
 * como evento (PagoConfirmado, PagoFallido). HU-27 · Modo de cobro.
 */
const cliente = cabecera({ idUsuario: 40, nombre: 'Camila', apellido: 'Cliente', rol: 'Cliente', cargo: null, permisos: ['PEDIDO_GESTIONAR', 'PEDIDO_LEER'] });
const admin = cabecera({ permisos: ['CONFIGURACION_GESTIONAR', 'VENTA_LEER', 'VENTA_REGISTRAR'] });

type Desenlace = { idPago: number; idPedido: number | null; estado: string; monto: number };
let conexion: ChannelModel;
const avisos: Evento<Desenlace>[] = [];

async function aviso(condicion: (e: Evento<Desenlace>) => boolean) {
  for (let i = 0; i < 50; i++) {
    const a = avisos.find(condicion);
    if (a) return a;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('no llegó el aviso esperado');
}

/** Lo que ms-pedidos pide al confirmar un pedido pagado en línea. */
const abrir = (idPedido: number, metodo = 'QR', monto = 70) =>
  request(app)
    .post('/interno/pagos')
    .send({ idPedido, monto, metodo, descripcion: `NutriExpress - Pedido ${idPedido}`, cliente: { nombre: 'Camila Cliente' } });

beforeAll(async () => {
  registrarSuscripciones();
  await conectarEventos({ servicio: 'ms-pagos', registro: registroDeEventos });
  await eventosListos();
  conexion = await amqp.connect(process.env.RABBITMQ_URL!);
  const canal = await conexion.createChannel();
  await canal.assertExchange(INTERCAMBIO, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
  await canal.bindQueue(queue, INTERCAMBIO, 'PagoConfirmado');
  await canal.bindQueue(queue, INTERCAMBIO, 'PagoFallido');
  await canal.consume(queue, (m) => m && avisos.push(JSON.parse(m.content.toString())), { noAck: true });
});

afterAll(async () => {
  await conexion.close();
  await cerrarEventos();
  await cerrarServidorDeClave();
});

describe('HU-26 · Cobro en línea', () => {
  it('abre el cobro con QR en la pasarela simulada y lo devuelve dibujado', async () => {
    const r = await abrir(101).expect(201);
    expect(r.body).toMatchObject({ estado: 'Pendiente', metodo: 'QR', modo: 'Simulado', simulado: true, idPedido: 101, monto: 70 });
    expect(r.body.tipoDatos).toBe('qr');
    expect(r.body.qrImagen).toMatch(/^data:image\/png;base64,/);
    // La referencia lleva el pedido y el número de cobro: así Libélula no la rechaza por repetida.
    expect(r.body.datosCobro).toMatch(/ref=PEDIDO-101-C\d+-/);
  });

  it('con tarjeta, el cobro es un enlace y no un QR', async () => {
    const r = await abrir(102, 'Tarjeta').expect(201);
    expect(r.body.tipoDatos).toBe('url');
    expect(r.body.qrImagen).toBeUndefined();
  });

  it('el efectivo no pasa por la pasarela', async () => {
    const r = await abrir(103, 'Efectivo').expect(400);
    expect(r.body.error).toMatch(/efectivo/i);
  });

  it('las rutas internas no se pueden llamar desde fuera del gateway', async () => {
    await request(app).post('/interno/pagos').set('X-Forwarded-For', '1.2.3.4').send({}).expect(404);
  });

  it('al consultarlo, el cobro simulado se confirma y publica PagoConfirmado una sola vez', async () => {
    const abierto = (await abrir(104)).body;
    const r = await request(app).get(`/api/pagos/${abierto.id}`).set(cliente).expect(200);
    expect(r.body.estado).toBe('Pagado');
    expect(r.body.confirmadoEn).not.toBeNull();

    const evento = await aviso((e) => e.tipo === 'PagoConfirmado' && e.datos.idPago === abierto.id);
    expect(evento.datos).toMatchObject({ idPedido: 104, estado: 'Pagado', monto: 70 });

    // Consultar otra vez no vuelve a confirmar ni a avisar (idempotencia).
    await request(app).get(`/api/pagos/${abierto.id}`).set(cliente).expect(200);
    await new Promise((r) => setTimeout(r, 500));
    expect(avisos.filter((e) => e.datos.idPago === abierto.id)).toHaveLength(1);
  });

  it('el pedido lo pide con su cobro (REST interno)', async () => {
    const r = await request(app).get('/interno/pagos/pedido/104').expect(200);
    expect(r.body).toMatchObject({ idPedido: 104, estado: 'Pagado' });
    const sin = await request(app).get('/interno/pagos/pedido/999').expect(200);
    expect(sin.body).toBeNull();
  });

  it('si vence el plazo, el cobro pasa a Vencido y publica PagoFallido', async () => {
    const abierto = (await abrir(105)).body;
    // Un cobro que la pasarela todavía no confirmó y cuyo plazo ya pasó.
    await prisma.pago.update({
      where: { id_pago: abierto.id },
      data: { fecha_expiracion: new Date(Date.now() - 60_000), id_transaccion_ext: null },
    });
    expect(await vencerPendientes()).toBeGreaterThanOrEqual(1);
    const evento = await aviso((e) => e.tipo === 'PagoFallido' && e.datos.idPago === abierto.id);
    expect(evento.datos).toMatchObject({ idPedido: 105, estado: 'Vencido' });
  });

  it('PedidoCancelado cierra el cobro pendiente del pedido', async () => {
    const abierto = (await abrir(106)).body;
    await prisma.pago.update({ where: { id_pago: abierto.id }, data: { id_transaccion_ext: null } });
    await publicar('PedidoCancelado', { idPedido: 106, idReserva: 'pedido-x', motivo: 'Cliente' });
    await aviso((e) => e.tipo === 'PagoFallido' && e.datos.idPago === abierto.id);
    const pago = await prisma.pago.findUnique({ where: { id_pago: abierto.id } });
    expect(pago!.estado).toBe('Fallido');
  });

  it('el personal confirma a mano un cobro, y queda quién lo hizo', async () => {
    const abierto = (await abrir(107)).body;
    await prisma.pago.update({ where: { id_pago: abierto.id }, data: { id_transaccion_ext: null } });
    await request(app).post(`/api/pagos/${abierto.id}/confirmar`).set(cliente).expect(403);
    const r = await request(app).post(`/api/pagos/${abierto.id}/confirmar`).set(admin).expect(200);
    expect(r.body.estado).toBe('Pagado');
    const evento = await prisma.evento_pago.findFirst({ where: { id_pago: abierto.id, tipo: 'Cerrado: Pagado' } });
    expect(evento!.cuerpo).toMatch(/Ana Prueba/);
    // Ya pagado: confirmarlo otra vez es un conflicto.
    await request(app).post(`/api/pagos/${abierto.id}/confirmar`).set(admin).expect(409);
  });
});

describe('HU-18, HU-19, HU-24 · Efectivo y anulación (Sprint 5)', () => {
  it('el efectivo de un pedido entregado nace Pagado; repetirlo devuelve el mismo cobro', async () => {
    const r = await request(app).post('/interno/pagos/efectivo').send({ idPedido: 120, monto: 35, quien: 'Rodrigo Reparto' }).expect(201);
    expect(r.body).toMatchObject({ metodo: 'Efectivo', estado: 'Pagado', pasarela: 'Mostrador', idPedido: 120, confirmadoEn: expect.any(String) });
    const otra = await request(app).post('/interno/pagos/efectivo').send({ idPedido: 120, monto: 35, quien: 'Rodrigo Reparto' }).expect(201);
    expect(otra.body.id).toBe(r.body.id);
    const evento = await prisma.evento_pago.findFirst({ where: { id_pago: r.body.id } });
    expect(evento).toMatchObject({ tipo: 'Cobrado contra entrega', cuerpo: 'Recibido por Rodrigo Reparto' });
  });

  it('anular una venta cobrada deja el reembolso pendiente; una con QR pendiente, Fallido', async () => {
    await request(app).post('/interno/pagos/efectivo').send({ idVenta: 31, monto: 20, quien: 'Victor Vendedor' }).expect(201);
    const pagada = await request(app).post('/interno/pagos/venta/31/anular').send({ detalle: 'Anulada: error de cobro' }).expect(200);
    expect(pagada.body).toEqual({ requiereDevolucion: true });
    expect((await request(app).get('/interno/pagos/venta/31').expect(200)).body.estado).toBe('Reembolsado');

    const qr = (await request(app).post('/interno/pagos').send({ idVenta: 32, monto: 20, metodo: 'QR', descripcion: 'NutriExpress - Venta 32' })).body;
    await prisma.pago.update({ where: { id_pago: qr.id }, data: { id_transaccion_ext: null } });
    const pendiente = await request(app).post('/interno/pagos/venta/32/anular').send({ detalle: 'Anulada' }).expect(200);
    expect(pendiente.body).toEqual({ requiereDevolucion: false });
    await aviso((e) => e.tipo === 'PagoFallido' && e.datos.idPago === qr.id);
  });

  it('el efectivo es de un pedido o de una venta, no de los dos', async () => {
    await request(app).post('/interno/pagos/efectivo').send({ idPedido: 1, idVenta: 1, monto: 5, quien: 'X' }).expect(400);
  });
});

describe('RF-PAG-02 · Aviso de la pasarela', () => {
  it('un aviso de un cobro desconocido se recibe sin hacer nada', async () => {
    const r = await request(app).post('/api/pagos/notificacion').send({ idTransaccion: 'SIM-no-existe', estado: 'Pagado' }).expect(200);
    expect(r.body.procesado).toBe(false);
  });

  it('un aviso que dice haber cobrado menos de lo debido se rechaza', async () => {
    const abierto = (await abrir(108)).body;
    const r = await request(app)
      .post('/api/pagos/notificacion')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ idTransaccion: abierto.referenciaExterna, estado: 'Pagado', monto: 10 }))
      .expect(409);
    expect(r.body.error).toMatch(/monto/);
  });
});

describe('HU-27 · Modo de cobro', () => {
  it('solo el administrador lo consulta y lo cambia', async () => {
    await request(app).get('/api/configuracion/cobro').set(cliente).expect(403);
    const r = await request(app).get('/api/configuracion/cobro').set(admin).expect(200);
    expect(r.body).toMatchObject({ modo: 'Simulado', pasarela: 'Simulada', operativa: true });
  });

  it('no se activa el modo real sin la configuración de Libélula', async () => {
    const r = await request(app).put('/api/configuracion/cobro').set(admin).send({ modo: 'Real' }).expect(409);
    expect(r.body.error).toMatch(/LIBELULA_URL_BASE/);
  });

  it('el cambio rige sin reiniciar y cada cobro conserva el modo con que nació', async () => {
    const antes = (await abrir(109)).body;
    // Simula una instalación ya configurada para Libélula.
    Object.assign(process.env, {
      LIBELULA_URL_BASE: 'https://libelula.invalido',
      LIBELULA_API_KEY: 'clave-de-prueba',
      LIBELULA_EMAIL_COMERCIO: 'ventas@nutriexpress.bo',
      PAGO_URL_PUBLICA: 'https://nutriexpress.invalido',
    });
    try {
      const r = await request(app).put('/api/configuracion/cobro').set(admin).send({ modo: 'Real' }).expect(200);
      expect(r.body).toMatchObject({ modo: 'Real', pasarela: 'Libelula', actualizadoPor: 'Ana Prueba' });
      // El cobro abierto antes sigue siendo simulado.
      const viejo = await prisma.pago.findUnique({ where: { id_pago: antes.id } });
      expect(viejo!.modo).toBe('Simulado');
    } finally {
      await request(app).put('/api/configuracion/cobro').set(admin).send({ modo: 'Simulado' }).expect(200);
      for (const v of ['LIBELULA_URL_BASE', 'LIBELULA_API_KEY', 'LIBELULA_EMAIL_COMERCIO', 'PAGO_URL_PUBLICA']) delete process.env[v];
      invalidarCache();
    }
  });
});
