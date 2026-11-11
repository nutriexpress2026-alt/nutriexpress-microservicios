import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import amqp, { type ChannelModel } from 'amqplib';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { cerrarServiciosFalsos, efectivos, reservas } from './servicios-falsos.js';
import { app } from '../src/app.js';
import { cerrarEventos, conectarEventos, eventosListos, INTERCAMBIO, type Evento } from '../src/config/eventos.js';
import { registrarSuscripciones } from '../src/suscripciones.js';
import { registroDeEventos } from '../src/models/evento.model.js';
import { prisma } from '../src/config/prisma.js';

/** HU-23 tablero de pedidos y HU-24 mis entregas: el lado del personal. */
const camila = cabecera({ idUsuario: 60, nombre: 'Camila', apellido: 'Cliente', rol: 'Cliente', cargo: null, permisos: ['PEDIDO_GESTIONAR', 'PEDIDO_LEER'] });
const vendedor = cabecera({ idUsuario: 3, nombre: 'Victor', apellido: 'Vendedor', rol: 'Empleado', cargo: 'Vendedor', permisos: ['PEDIDO_LEER', 'PEDIDO_GESTIONAR'] });
const rodrigo = cabecera({ idUsuario: 7, nombre: 'Rodrigo', apellido: 'Reparto', rol: 'Empleado', cargo: 'Repartidor', permisos: ['PEDIDO_LEER', 'PEDIDO_GESTIONAR'] });
const rosa = cabecera({ idUsuario: 8, nombre: 'Rosa', apellido: 'Ruta', rol: 'Empleado', cargo: 'Repartidor', permisos: ['PEDIDO_LEER', 'PEDIDO_GESTIONAR'] });
const admin = cabecera({ idUsuario: 1, rol: 'Administrador', cargo: 'Administrador', permisos: ['PEDIDO_LEER', 'PEDIDO_GESTIONAR', 'PEDIDO_CERRAR_AJENO'] });

const direccion = { calle: 'Avenida Banzer', numero: '1200', referencia: 'Portón verde, frente al parque' };
let conexion: ChannelModel;
const cancelados: Evento<{ idPedido: number; idReserva: string; motivo: string }>[] = [];
const fotos: Evento<{ idPedido: number; estado: string; repartidor: { id: number; nombre: string } | null; fechaEntrega: string | null; items: { costoUnitario: number | null }[] }>[] = [];

async function esperar<T>(buscar: () => T | undefined): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const v = buscar();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('no ocurrió lo esperado');
}

/** Un pedido en efectivo de Camila, recién recibido. */
async function pedido(): Promise<{ id: number; total: number }> {
  return (await request(app).post('/api/pedidos').set(camila).send({ metodoPago: 'Efectivo', ubicacion: direccion, items: [{ idProducto: 1, cantidad: 1 }] }).expect(201)).body;
}

const avanzar = (cab: Record<string, string>, id: number, estado: string) =>
  request(app).patch(`/api/gestion/pedidos/${id}/estado`).set(cab).send({ estado });

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
  // HU-29, HU-32 · La foto que recibe ms-reportes.
  const fotosCola = (await canal.assertQueue('', { exclusive: true, autoDelete: true })).queue;
  await canal.bindQueue(fotosCola, INTERCAMBIO, 'PedidoEstadoCambiado');
  await canal.consume(fotosCola, (m) => m && fotos.push(JSON.parse(m.content.toString())), { noAck: true });
});

afterAll(async () => {
  await conexion.close();
  await cerrarEventos();
  await cerrarServiciosFalsos();
  await cerrarServidorDeClave();
});

describe('HU-23 · Tablero de pedidos', () => {
  it('el personal ve todos los pedidos, con su página y cuántos hay por estado', async () => {
    const { id } = await pedido();
    const r = await request(app).get('/api/gestion/pedidos?estado=Recibido').set(vendedor).expect(200);
    expect(r.body).toMatchObject({ pagina: 1, total: expect.any(Number) });
    const fila = r.body.datos.find((p: { id: number }) => p.id === id);
    expect(fila).toMatchObject({ cliente: { id: 60, nombreCompleto: 'Camila Cliente' }, repartidor: null, transicionesPosibles: ['En preparacion'] });
    const resumen = await request(app).get('/api/gestion/pedidos/resumen').set(vendedor).expect(200);
    expect(resumen.body.Recibido).toBeGreaterThan(0);
  });

  it('un cliente no entra al tablero', async () => {
    await request(app).get('/api/gestion/pedidos').set(camila).expect(403);
  });

  it('solo se asignan empleados con cargo Repartidor', async () => {
    const { id } = await pedido();
    const r = await request(app).put(`/api/gestion/pedidos/${id}/repartidor`).set(vendedor).send({ idRepartidor: 3 }).expect(409);
    expect(r.body.error).toMatch(/cargo Repartidor/);
    const ok = await request(app).put(`/api/gestion/pedidos/${id}/repartidor`).set(vendedor).send({ idRepartidor: 7 }).expect(200);
    expect(ok.body.repartidor).toEqual({ id: 7, nombreCompleto: 'Rodrigo Reparto' });
  });

  it('sugiere al repartidor de turno con menos entregas en curso', async () => {
    await request(app).put('/api/gestion/disponibilidad').set(rodrigo).send({ disponible: true }).expect(200);
    await request(app).put('/api/gestion/disponibilidad').set(rosa).send({ disponible: true }).expect(200);
    const { id } = await pedido();
    const r = await request(app).get(`/api/gestion/pedidos/${id}/sugerencia-repartidor`).set(vendedor).expect(200);
    // Rodrigo ya tiene un pedido en curso de la prueba anterior: se sugiere a Rosa.
    expect(r.body.sugerido).toMatchObject({ id: 8, nombreCompleto: 'Rosa Ruta', disponible: true, entregasEnCurso: 0 });
    expect(r.body.candidatos.map((c: { id: number }) => c.id)).toEqual([8, 7]);
  });

  it('los estados siguen el flujo: no se salta a Entregado ni sale sin repartidor', async () => {
    const { id } = await pedido();
    const salto = await avanzar(vendedor, id, 'Entregado').expect(409);
    expect(salto.body.error).toMatch(/solo puede pasar a En preparacion/);
    await avanzar(vendedor, id, 'En preparacion').expect(200);
    const sinRepartidor = await avanzar(vendedor, id, 'En camino').expect(409);
    expect(sinRepartidor.body.error).toMatch(/Asigne un repartidor/);
  });
});

describe('HU-24 · Mis entregas', () => {
  async function enCamino(cab: Record<string, string>, idRepartidor: number) {
    const p = await pedido();
    await avanzar(vendedor, p.id, 'En preparacion').expect(200);
    await request(app).put(`/api/gestion/pedidos/${p.id}/repartidor`).set(vendedor).send({ idRepartidor }).expect(200);
    await avanzar(vendedor, p.id, 'En camino').expect(200);
    return p;
  }

  it('el repartidor ve sus entregas y comparte su ubicación solo con algo en camino', async () => {
    await request(app).put('/api/gestion/mi-posicion').set(rosa).send({ latitud: -17.78, longitud: -63.18 }).expect(409);
    const p = await enCamino(rosa, 8);
    const mias = await request(app).get('/api/gestion/mis-entregas').set(rosa).expect(200);
    expect(mias.body.map((x: { id: number }) => x.id)).toContain(p.id);
    await request(app).put('/api/gestion/mi-posicion').set(rosa).send({ latitud: -17.7801234567, longitud: -63.18, precision: 8.25 }).expect(204);
    // El cliente lo sigue en el mapa (HU-25).
    const seguimiento = await request(app).get(`/api/pedidos/${p.id}/seguimiento`).set(camila).expect(200);
    expect(seguimiento.body).toMatchObject({ enCamino: true, repartidor: 'Rosa', posicion: { latitud: -17.780123, precision: 8.3 } });
  });

  it('solo el repartidor asignado cierra la entrega; entregar cobra el efectivo y consume la reserva', async () => {
    const p = await enCamino(rodrigo, 7);
    const ajeno = await avanzar(rosa, p.id, 'Entregado').expect(403);
    expect(ajeno.body.error).toMatch(/Solo el repartidor asignado/);

    const r = await avanzar(rodrigo, p.id, 'Entregado').expect(200);
    expect(r.body).toMatchObject({ estadoPedido: 'Entregado', estadoPago: 'Pagado', fechaEntrega: expect.any(String) });
    const fila = await prisma.pedido.findUnique({ where: { id_pedido: p.id } });
    expect(reservas.get(fila!.id_reserva)!.estado).toBe('Consumida');
    expect(efectivos.find((e) => e.idPedido === p.id)).toMatchObject({ monto: p.total, quien: 'Rodrigo Reparto' });
    // Sin más pedidos en camino, deja de compartir su posición.
    expect(await prisma.posicion_repartidor.findUnique({ where: { id_empleado: 7 } })).toBeNull();
  });

  it('no entregar devuelve el stock (PedidoCancelado, motivo No entregado)', async () => {
    const p = await enCamino(rodrigo, 7);
    const r = await avanzar(rodrigo, p.id, 'Cancelado').expect(200);
    expect(r.body).toMatchObject({ estadoPedido: 'Cancelado', motivoCancelacion: 'No entregado' });
    const aviso = await esperar(() => cancelados.find((e) => e.datos.idPedido === p.id));
    expect(aviso.datos.motivo).toBe('No entregado');
  });

  it('el administrador puede cerrar la entrega de otro (PEDIDO_CERRAR_AJENO)', async () => {
    const p = await enCamino(rosa, 8);
    await avanzar(admin, p.id, 'Entregado').expect(200);
  });

  it('la foto para ms-reportes lleva el repartidor al asignarlo y el costo al entregar (HU-29)', async () => {
    const p = await pedido();
    await avanzar(vendedor, p.id, 'En preparacion').expect(200);
    await request(app).put(`/api/gestion/pedidos/${p.id}/repartidor`).set(vendedor).send({ idRepartidor: 7 }).expect(200);
    const asignado = await esperar(() => fotos.find((e) => e.datos.idPedido === p.id && e.datos.repartidor !== null));
    expect(asignado.datos).toMatchObject({ estado: 'En preparacion', repartidor: { id: 7, nombre: 'Rodrigo Reparto' } });
    await avanzar(vendedor, p.id, 'En camino').expect(200);
    await avanzar(rodrigo, p.id, 'Entregado').expect(200);
    const entregado = await esperar(() => fotos.find((e) => e.datos.idPedido === p.id && e.datos.estado === 'Entregado'));
    expect(entregado.datos.fechaEntrega).toEqual(expect.any(String));
    expect(entregado.datos.items[0].costoUnitario).toBe(21.5);
  });

  it('ms-reportes puede pedir todos los pedidos (REST interno)', async () => {
    const r = await request(app).get('/interno/pedidos/reporte').expect(200);
    expect(r.body.length).toBe(await prisma.pedido.count());
    await request(app).get('/interno/pedidos/reporte').set('X-Forwarded-For', '1.2.3.4').expect(404);
  });

  it('cuenta los pedidos de cada cliente para su ficha (REST interno)', async () => {
    const r = await request(app).get('/interno/pedidos/conteo?clientes=60,61').expect(200);
    expect(r.body['60']).toBeGreaterThan(0);
    expect(r.body['61']).toBeUndefined();
  });
});
