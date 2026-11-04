import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import amqp, { type ChannelModel } from 'amqplib';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { app } from '../src/app.js';
import { cerrarEventos, conectarEventos, eventosListos, INTERCAMBIO, type Evento } from '../src/config/eventos.js';
import { prisma } from '../src/config/prisma.js';

/**
 * HT-03 · T2.2 — ms-catalogo avisa con ProductoGuardado cada alta o cambio de
 * producto, para que ms-inventario mantenga su réplica (antes era un PUT a
 * /interno/productos de inventario).
 */
const admin = cabecera({ permisos: ['PRODUCTO_GESTIONAR'] });
let conexion: ChannelModel;
const avisos: Evento<{ id: number; nombre: string; tipoConservacion: string; activo: boolean }>[] = [];

async function avisoDe(id: number, condicion: (d: (typeof avisos)[number]['datos']) => boolean = () => true) {
  for (let i = 0; i < 50; i++) {
    const a = avisos.find((e) => e.datos.id === id && condicion(e.datos));
    if (a) return a;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no llegó ProductoGuardado para el producto ${id}`);
}

beforeAll(async () => {
  await conectarEventos({ servicio: 'ms-catalogo' });
  await eventosListos();
  conexion = await amqp.connect(process.env.RABBITMQ_URL!);
  const canal = await conexion.createChannel();
  await canal.assertExchange(INTERCAMBIO, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
  await canal.bindQueue(queue, INTERCAMBIO, 'ProductoGuardado');
  await canal.consume(queue, (m) => m && avisos.push(JSON.parse(m.content.toString())), { noAck: true });
});

afterAll(async () => {
  await conexion.close();
  await cerrarEventos();
  await prisma.$disconnect();
  await cerrarServidorDeClave();
});

describe('HT-03 · ProductoGuardado mantiene la réplica de ms-inventario (T2.2)', () => {
  it('al crear un producto se publica con lo que la réplica necesita', async () => {
    const categorias = (await request(app).get('/api/catalogo/categorias').expect(200)).body;
    const creado = await request(app)
      .post('/api/productos')
      .set(admin)
      .send({ nombre: 'Té helado de limón', precioVenta: 9, idCategoria: categorias[0].id, tipoConservacion: 'Refrigerado' })
      .expect(201);

    const aviso = await avisoDe(creado.body.id);
    expect(aviso.origen).toBe('ms-catalogo');
    expect(aviso.datos).toEqual({
      id: creado.body.id,
      nombre: 'Té helado de limón',
      tipoConservacion: 'Refrigerado',
      activo: true,
    });
  });

  it('al cambiarlo o darlo de baja se vuelve a publicar con el dato nuevo', async () => {
    const categorias = (await request(app).get('/api/catalogo/categorias').expect(200)).body;
    const creado = await request(app)
      .post('/api/productos')
      .set(admin)
      .send({ nombre: 'Galleta de avena', precioVenta: 4, idCategoria: categorias[0].id, tipoConservacion: 'Seco' })
      .expect(201);

    await request(app).put(`/api/productos/${creado.body.id}`).set(admin).send({ activo: false }).expect(200);
    const baja = await avisoDe(creado.body.id, (d) => d.activo === false);
    expect(baja.datos.nombre).toBe('Galleta de avena');
  });
});
