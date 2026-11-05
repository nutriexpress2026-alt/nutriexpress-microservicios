import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import amqp, { type ChannelModel } from 'amqplib';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { app } from '../src/app.js';
import {
  cerrarEventos,
  colaDe,
  colaFallidosDe,
  conectarEventos,
  eventosListos,
  INTERCAMBIO,
  suscribir,
  type Evento,
} from '../src/config/eventos.js';
import { insumoGuardado } from '../src/services/replica.service.js';
import { produccionRegistrada } from '../src/services/orden.service.js';
import { registroDeEventos } from '../src/models/evento.model.js';
import { prisma } from '../src/config/prisma.js';

/**
 * HU-10 Órdenes de producción: «calcula los insumos según el rendimiento; no se
 * finaliza sin insumos suficientes; al finalizar se descuentan los insumos y se
 * suma el producto».
 *
 * ms-inventario es aquí un servidor falso (verificar, reservar, liberar), para
 * decidir si hay stock y ver qué se le pide. Los eventos van por el RabbitMQ de
 * docker compose; lo que hace inventario con OrdenFinalizada se prueba en
 * ms-inventario (produccion.test.ts).
 */
const SERVICIO = `prueba-ordenes-${Math.random().toString(36).slice(2, 8)}`;
const URL_RABBIT = process.env.RABBITMQ_URL!;
const admin = cabecera({ permisos: ['PRODUCTO_GESTIONAR', 'ORDEN_PRODUCCION_GESTIONAR'] });
const cocinero = cabecera({
  idUsuario: 44,
  nombre: 'Carlos',
  apellido: 'Cocina',
  rol: 'Empleado',
  cargo: 'Cocinero',
  permisos: ['ORDEN_PRODUCCION_GESTIONAR'],
});
const cliente = cabecera({ idUsuario: 9, rol: 'Cliente', cargo: null, permisos: ['PEDIDO_LEER'] });

/* ---------- ms-inventario falso ---------- */
const COSTOS: Record<number, { nombre: string; unidad: string; costo: number }> = {
  9101: { nombre: 'Tomate', unidad: 'kg', costo: 8 },
  9102: { nombre: 'Lechuga', unidad: 'u', costo: 3.5 },
};
let sinStock = false;
const pedidos: { ruta: string; cuerpo: Record<string, unknown> }[] = [];
const reservas = new Map<string, { estado: string; cuerpo: Record<string, unknown> }>();
let inventario: Server;

function respuesta(cuerpo: Record<string, unknown>) {
  const insumos = (cuerpo.insumos as { idIngrediente: number; cantidad: number }[]).map((l) => ({
    ...l,
    nombre: COSTOS[l.idIngrediente].nombre,
    unidad: COSTOS[l.idIngrediente].unidad,
    costoUnitario: COSTOS[l.idIngrediente].costo,
  }));
  return {
    insumos,
    costoInsumos: Math.round(insumos.reduce((t, l) => t + l.cantidad * l.costoUnitario, 0) * 100) / 100,
    almacenDestino: cuerpo.destino ? { id: 2, nombre: 'Camara Refrigerada' } : null,
  };
}

function atender(ruta: string, cuerpo: Record<string, unknown>): [number, unknown] {
  if (!ruta.startsWith('/interno/reservas')) return [404, { error: 'No existe' }];
  pedidos.push({ ruta, cuerpo });
  const liberar = /^\/interno\/reservas\/(.+)\/liberar$/.exec(ruta);
  if (liberar) {
    const r = reservas.get(decodeURIComponent(liberar[1]));
    if (r) r.estado = 'Liberada';
    return [r ? 200 : 404, {}];
  }
  // Lo demás (existencias de productos, etc.) no le toca a esta prueba.
  if (ruta !== '/interno/reservas' && ruta !== '/interno/reservas/verificar') return [404, { error: 'No existe' }];
  if (sinStock) return [409, { error: 'Stock insuficiente: Tomate: se necesitan 0,75 kg y hay 0,2 kg disponibles' }];
  if (ruta === '/interno/reservas/verificar') return [200, respuesta(cuerpo)];
  const id = cuerpo.id as string;
  const previa = reservas.get(id);
  if (previa && previa.estado !== 'Liberada') return [200, { id, estado: previa.estado, ...respuesta(previa.cuerpo) }];
  reservas.set(id, { estado: 'Activa', cuerpo });
  return [201, { id, estado: 'Activa', ...respuesta(cuerpo) }];
}

/* ---------- eventos ---------- */
let conexion: ChannelModel;
const finalizadas: Evento<Record<string, unknown>>[] = [];

async function publicarCrudo(tipo: string, datos: unknown) {
  const evento: Evento = { id: crypto.randomUUID(), tipo, origen: 'ms-inventario', fecha: new Date().toISOString(), datos };
  const c = await amqp.connect(URL_RABBIT);
  const canal = await c.createConfirmChannel();
  canal.publish(INTERCAMBIO, tipo, Buffer.from(JSON.stringify(evento)), { persistent: true });
  await canal.waitForConfirms();
  await c.close();
  for (let i = 0; i < 100 && !(await registroDeEventos.yaProcesado(evento.id)); i++) await new Promise((r) => setTimeout(r, 50));
}

async function finalizadaDe(idOrden: number) {
  for (let i = 0; i < 50; i++) {
    const e = finalizadas.find((x) => x.datos.idOrden === idOrden);
    if (e) return e;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no llegó OrdenFinalizada de la orden ${idOrden}`);
}

/* ---------- datos ---------- */
let idProducto: number;
let recetaActiva: { id: number };
const ordenes = (cuerpo: object) => request(app).post('/api/ordenes').set(cocinero).send(cuerpo);
const accion = (id: number, ruta: string, cuerpo?: object) =>
  request(app).post(`/api/ordenes/${id}/${ruta}`).set(cocinero).send(cuerpo ?? {});
async function ordenEnProceso(cantidad = 6) {
  const o = (await ordenes({ idReceta: recetaActiva.id, cantidad }).expect(201)).body;
  await accion(o.id, 'iniciar').expect(200);
  return o;
}

beforeAll(async () => {
  inventario = createServer((req, res) => {
    let datos = '';
    req.on('data', (c) => (datos += c));
    req.on('end', () => {
      const [estado, cuerpo] = atender(req.url ?? '', datos ? JSON.parse(datos) : {});
      res.writeHead(estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cuerpo));
    });
  });
  await new Promise<void>((ok) => inventario.listen(4997, '127.0.0.1', ok));
  process.env.INVENTARIO_URL = 'http://127.0.0.1:4997';

  suscribir('ProduccionRegistrada', produccionRegistrada);
  await conectarEventos({ servicio: SERVICIO, registro: registroDeEventos });
  await eventosListos();
  conexion = await amqp.connect(URL_RABBIT);
  const canal = await conexion.createChannel();
  await canal.assertExchange(INTERCAMBIO, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
  await canal.bindQueue(queue, INTERCAMBIO, 'OrdenFinalizada');
  await canal.consume(queue, (m) => m && finalizadas.push(JSON.parse(m.content.toString())), { noAck: true });

  for (const [id, i] of Object.entries(COSTOS)) {
    await insumoGuardado({
      id: crypto.randomUUID(),
      tipo: 'InsumoGuardado',
      origen: 'ms-inventario',
      fecha: new Date().toISOString(),
      datos: { id: Number(id), nombre: i.nombre, unidad: i.unidad, costoUnitario: i.costo, activo: true },
    });
  }
  const categorias = (await request(app).get('/api/catalogo/categorias').expect(200)).body;
  idProducto = (
    await request(app)
      .post('/api/productos')
      .set(admin)
      .send({ nombre: 'Ensalada para producir', precioVenta: 28, idCategoria: categorias[0].id, tipoConservacion: 'Refrigerado' })
      .expect(201)
  ).body.id;
  recetaActiva = (
    await request(app)
      .post(`/api/productos/${idProducto}/recetas`)
      .set(admin)
      .send({
        nombre: 'Rinde 4',
        rendimiento: 4,
        tiempoPreparacionMinutos: 15,
        divisible: true,
        insumos: [
          { idIngrediente: 9101, cantidadRequerida: 0.5 },
          { idIngrediente: 9102, cantidadRequerida: 2 },
        ],
      })
      .expect(201)
  ).body;
  await request(app).post(`/api/recetas/${recetaActiva.id}/activar`).set(admin).expect(200);
});

afterAll(async () => {
  await conexion.close();
  await cerrarEventos();
  const c = await amqp.connect(URL_RABBIT);
  const canal = await c.createChannel();
  await canal.deleteQueue(colaDe(SERVICIO));
  await canal.deleteQueue(colaFallidosDe(SERVICIO));
  await c.close();
  await new Promise((ok) => inventario.close(ok));
  // Deja la base como estaba: las demás pruebas cuentan los productos del catálogo.
  const recetas = (await prisma.receta.findMany({ where: { id_producto: idProducto } })).map((r) => r.id_receta);
  const ids = (await prisma.orden_produccion.findMany({ where: { id_receta: { in: recetas } } })).map((o) => o.id_orden_produccion);
  await prisma.detalle_orden_insumo.deleteMany({ where: { id_orden_produccion: { in: ids } } });
  await prisma.orden_produccion.deleteMany({ where: { id_orden_produccion: { in: ids } } });
  await prisma.receta.deleteMany({ where: { id_producto: idProducto } });
  await prisma.producto.deleteMany({ where: { id_producto: idProducto } });
  await prisma.insumo.deleteMany({ where: { id_ingrediente: { in: [9101, 9102] } } });
  await prisma.$disconnect();
  await cerrarServidorDeClave();
});

describe('HU-10 · Registrar una orden', () => {
  it('queda Pendiente con la receta activa, y sus insumos salen del rendimiento', async () => {
    const r = await ordenes({ idReceta: recetaActiva.id, cantidad: 6 }).expect(201);
    expect(r.body).toMatchObject({
      estado: 'Pendiente',
      cantidad: 6,
      transicionesPosibles: ['En proceso'],
      cancelable: true,
      receta: { id: recetaActiva.id, nombre: 'Rinde 4', rendimiento: 4 },
      producto: { id: idProducto, nombre: 'Ensalada para producir', tipoConservacion: 'Refrigerado' },
      registradoPor: { id: 44, nombreCompleto: 'Carlos Cocina' },
      cantidadObtenida: null,
      notas: { egreso: null, ingreso: null },
    });
    // 6 porciones / rinde 4 = 1,5 corridas: 0,75 kg de tomate y 3 lechugas.
    expect(r.body.insumosRequeridos).toEqual([
      { idIngrediente: 9101, nombre: 'Tomate', unidad: 'kg', cantidadRequerida: 0.75, costoUnitario: 8 },
      { idIngrediente: 9102, nombre: 'Lechuga', unidad: 'u', cantidadRequerida: 3, costoUnitario: 3.5 },
    ]);
    expect(r.body.costoEstimado).toBe(16.5);
    // Se le preguntó a inventario si alcanzan, sin reservar.
    expect(pedidos.at(-1)).toEqual({
      ruta: '/interno/reservas/verificar',
      cuerpo: { insumos: [{ idIngrediente: 9101, cantidad: 0.75 }, { idIngrediente: 9102, cantidad: 3 }] },
    });
  });

  it('sin insumos suficientes, la orden no se registra', async () => {
    const antes = await prisma.orden_produccion.count();
    sinStock = true;
    const r = await ordenes({ idReceta: recetaActiva.id, cantidad: 6 }).expect(409);
    sinStock = false;
    expect(r.body.error).toContain('Stock insuficiente: Tomate');
    expect(await prisma.orden_produccion.count()).toBe(antes);
  });

  it('solo con la receta activa; una receta no divisible pide corridas completas', async () => {
    const inactiva = (
      await request(app)
        .post(`/api/productos/${idProducto}/recetas`)
        .set(admin)
        .send({ nombre: 'Bandeja', rendimiento: 4, tiempoPreparacionMinutos: 30, divisible: false, insumos: [{ idIngrediente: 9101, cantidadRequerida: 1 }] })
        .expect(201)
    ).body;
    await ordenes({ idReceta: inactiva.id, cantidad: 4 }).expect(409);

    await request(app).post(`/api/recetas/${inactiva.id}/activar`).set(admin).expect(200);
    const r = await ordenes({ idReceta: inactiva.id, cantidad: 6 }).expect(400);
    expect(r.body.error).toContain('corridas completas de 4 porciones. Puede producir 8');
    await ordenes({ idReceta: inactiva.id, cantidad: 8 }).expect(201);
    // Vuelve la activa de las demás pruebas.
    await request(app).post(`/api/recetas/${recetaActiva.id}/activar`).set(admin).expect(200);
  });

  it('el personal la registra; un cliente no ve las órdenes', async () => {
    await request(app).get('/api/ordenes').set(cliente).expect(403);
    await request(app).post('/api/ordenes').set(cliente).send({ idReceta: recetaActiva.id, cantidad: 1 }).expect(403);
  });
});

describe('HU-10 · Iniciar, cancelar y finalizar', () => {
  it('avanza Pendiente → En proceso sin saltarse pasos', async () => {
    const o = (await ordenes({ idReceta: recetaActiva.id, cantidad: 4 }).expect(201)).body;
    const r = await accion(o.id, 'finalizar', { cantidadObtenida: 4 }).expect(409);
    expect(r.body.error).toContain('inicie la producción');
    const iniciada = await accion(o.id, 'iniciar').expect(200);
    expect(iniciada.body).toMatchObject({ estado: 'En proceso', transicionesPosibles: ['Finalizada'] });
    await accion(o.id, 'iniciar').expect(409);
  });

  it('finalizar reserva los insumos en inventario, publica OrdenFinalizada y registra la merma', async () => {
    const o = await ordenEnProceso(6);
    const r = await accion(o.id, 'finalizar', { cantidadObtenida: 5 }).expect(200);
    expect(r.body).toMatchObject({
      estado: 'Finalizada',
      cantidadObtenida: 5,
      merma: 1,
      costoEstimado: 16.5,
      // El costo se reparte entre lo obtenido: 16,5 / 5.
      costoUnitario: 3.3,
      almacenDestino: { id: 2, nombre: 'Camara Refrigerada' },
      transicionesPosibles: [],
      cancelable: false,
    });
    expect(r.body.fechaFinalizacion).not.toBeNull();

    expect(pedidos.at(-1)).toEqual({
      ruta: '/interno/reservas',
      cuerpo: {
        id: `orden-${o.id}`,
        origen: 'ms-catalogo',
        insumos: [{ idIngrediente: 9101, cantidad: 0.75 }, { idIngrediente: 9102, cantidad: 3 }],
        destino: { idProducto, idAlmacen: null },
      },
    });
    const evento = await finalizadaDe(o.id);
    expect(evento.datos).toEqual({
      idOrden: o.id,
      idReserva: `orden-${o.id}`,
      idProducto,
      cantidadObtenida: 5,
      empleado: { id: 44, nombre: 'Carlos', apellido: 'Cocina' },
    });
  });

  it('lo que se consumió queda fijo: editar la receta después no reescribe la orden', async () => {
    const o = await ordenEnProceso(4);
    await accion(o.id, 'finalizar', { cantidadObtenida: 4 }).expect(200);
    await request(app)
      .put(`/api/recetas/${recetaActiva.id}`)
      .set(admin)
      .send({ nombre: 'Rinde 4', rendimiento: 4, tiempoPreparacionMinutos: 15, divisible: true, insumos: [{ idIngrediente: 9101, cantidadRequerida: 9 }] })
      .expect(200);
    const despues = (await request(app).get(`/api/ordenes/${o.id}`).set(cocinero).expect(200)).body;
    expect(despues.insumosRequeridos.map((l: { cantidadRequerida: number }) => l.cantidadRequerida)).toEqual([0.5, 2]);
    // La receta vuelve a como estaba.
    await request(app)
      .put(`/api/recetas/${recetaActiva.id}`)
      .set(admin)
      .send({
        nombre: 'Rinde 4',
        rendimiento: 4,
        tiempoPreparacionMinutos: 15,
        divisible: true,
        insumos: [
          { idIngrediente: 9101, cantidadRequerida: 0.5 },
          { idIngrediente: 9102, cantidadRequerida: 2 },
        ],
      })
      .expect(200);
  });

  it('si los insumos ya no alcanzan al finalizar, la orden sigue En proceso', async () => {
    const o = await ordenEnProceso(6);
    sinStock = true;
    const r = await accion(o.id, 'finalizar', { cantidadObtenida: 6 }).expect(409);
    sinStock = false;
    expect(r.body.error).toContain('Stock insuficiente');
    expect((await request(app).get(`/api/ordenes/${o.id}`).set(cocinero)).body.estado).toBe('En proceso');
  });

  it('no se registran más porciones que las planificadas', async () => {
    const o = await ordenEnProceso(4);
    await accion(o.id, 'finalizar', { cantidadObtenida: 5 }).expect(400);
  });

  it('ProduccionRegistrada de inventario deja en la orden sus notas y el costo real', async () => {
    const o = await ordenEnProceso(6);
    await accion(o.id, 'finalizar', { cantidadObtenida: 5 }).expect(200);
    await publicarCrudo('ProduccionRegistrada', { idOrden: o.id, idNotaEgreso: 77, idNotaIngreso: 78, costoTotal: 17 });
    const r = (await request(app).get(`/api/ordenes/${o.id}`).set(cocinero).expect(200)).body;
    expect(r).toMatchObject({ notas: { egreso: 77, ingreso: 78 }, costoEstimado: 17, costoUnitario: 3.4 });
  });

  it('se cancela Pendiente o En proceso (y se libera lo que hubiera reservado); una Finalizada no', async () => {
    const pendiente = (await ordenes({ idReceta: recetaActiva.id, cantidad: 4 }).expect(201)).body;
    const c = await accion(pendiente.id, 'cancelar').expect(200);
    expect(c.body).toMatchObject({ estado: 'Cancelada', cancelable: false });
    expect(pedidos.at(-1)!.ruta).toBe(`/interno/reservas/orden-${pendiente.id}/liberar`);

    const finalizada = await ordenEnProceso(4);
    await accion(finalizada.id, 'finalizar', { cantidadObtenida: 4 }).expect(200);
    await accion(finalizada.id, 'cancelar').expect(409);
  });

  it('listado por páginas con filtro por estado, y el resumen cuenta todas', async () => {
    const r = (await request(app).get('/api/ordenes').query({ estado: 'Finalizada', porPagina: 2 }).set(cocinero).expect(200)).body;
    expect(r).toMatchObject({ pagina: 1, porPagina: 2 });
    expect(r.datos.length).toBeLessThanOrEqual(2);
    expect(r.datos.every((o: { estado: string }) => o.estado === 'Finalizada')).toBe(true);
    expect(r.total).toBeGreaterThanOrEqual(3);

    const resumen = (await request(app).get('/api/ordenes/resumen').set(cocinero).expect(200)).body;
    expect(Object.keys(resumen).sort()).toEqual(['Cancelada', 'En proceso', 'Finalizada', 'Pendiente']);
    expect(resumen.Finalizada).toBe(r.total);
  });

  it('una versión de receta con órdenes no se elimina', async () => {
    const otra = (
      await request(app)
        .post(`/api/productos/${idProducto}/recetas`)
        .set(admin)
        .send({ nombre: 'Otra', rendimiento: 2, tiempoPreparacionMinutos: 5, divisible: true, insumos: [{ idIngrediente: 9102, cantidadRequerida: 1 }] })
        .expect(201)
    ).body;
    await request(app).post(`/api/recetas/${otra.id}/activar`).set(admin).expect(200);
    const r = await request(app).delete(`/api/recetas/${recetaActiva.id}`).set(admin).expect(409);
    expect(r.body.error).toContain('orden(es) de producción');
    await request(app).post(`/api/recetas/${recetaActiva.id}/activar`).set(admin).expect(200);
  });

  // Al final: cierra los eventos para simular que RabbitMQ no responde.
  it('si el aviso a inventario no sale, la orden vuelve a En proceso y se libera la reserva', async () => {
    const o = await ordenEnProceso(4);
    await cerrarEventos();
    const r = await accion(o.id, 'finalizar', { cantidadObtenida: 4 }).expect(503);
    expect(r.body.error).toContain('Intente de nuevo');
    const despues = (await request(app).get(`/api/ordenes/${o.id}`).set(cocinero).expect(200)).body;
    expect(despues).toMatchObject({ estado: 'En proceso', cantidadObtenida: null, almacenDestino: null });
    expect(reservas.get(`orden-${o.id}`)!.estado).toBe('Liberada');
  });
});
