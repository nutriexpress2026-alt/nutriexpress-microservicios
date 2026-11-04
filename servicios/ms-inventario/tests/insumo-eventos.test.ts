import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import amqp, { type ChannelModel } from 'amqplib';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { app } from '../src/app.js';
import { cerrarEventos, conectarEventos, eventosListos, INTERCAMBIO, type Evento } from '../src/config/eventos.js';
import { prisma } from '../src/config/prisma.js';

/**
 * HU-09 · ms-inventario avisa a ms-catalogo lo que su réplica de insumos
 * necesita (InsumoGuardado, InsumoEliminado), y no elimina un insumo que una
 * receta del catálogo usa.
 */
const almacenero = cabecera({
  idUsuario: 5,
  nombre: 'Ana',
  apellido: 'Almacén',
  rol: 'Empleado',
  cargo: 'Almacenero',
  permisos: ['STOCK_CONSULTAR', 'INSUMO_GESTIONAR', 'INGRESO_REGISTRAR'],
});

type DatosInsumo = { id: number; nombre: string; unidad: string; costoUnitario: number; activo: boolean };
let conexion: ChannelModel;
const avisos: Evento<DatosInsumo>[] = [];
let kilogramo: number;
let seco: number;

/** Un ms-catalogo falso que responde cuántas recetas usan cada insumo. */
let catalogo: Server;
const recetasPorInsumo = new Map<number, number>();

async function aviso(condicion: (e: Evento<DatosInsumo>) => boolean) {
  for (let i = 0; i < 50; i++) {
    const a = avisos.find(condicion);
    if (a) return a;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('no llegó el aviso esperado');
}

/** Los insumos que crea esta prueba: al terminar se borran, para no cambiar la carga inicial que ven las demás. */
const creados: number[] = [];

async function crearInsumo(nombre: string) {
  const r = await request(app)
    .post('/api/insumos')
    .set(almacenero)
    .send({ nombre, idUnidad: kilogramo, stockMinimo: 0, tipoConservacion: 'Seco' })
    .expect(201);
  creados.push(r.body.id);
  return r;
}

async function borrarCreados() {
  const detalles = await prisma.detalle_ingreso_insumo.findMany({ where: { id_ingrediente: { in: creados } } });
  const notas = [...new Set(detalles.map((d) => d.id_nota_ingreso))];
  await prisma.detalle_ingreso_insumo.deleteMany({ where: { id_ingrediente: { in: creados } } });
  await prisma.nota_ingreso.deleteMany({ where: { id_nota_ingreso: { in: notas } } });
  await prisma.ingrediente_almacen.deleteMany({ where: { id_ingrediente: { in: creados } } });
  await prisma.ingrediente.deleteMany({ where: { id_ingrediente: { in: creados } } });
}

beforeAll(async () => {
  await conectarEventos({ servicio: 'ms-inventario' });
  await eventosListos();
  conexion = await amqp.connect(process.env.RABBITMQ_URL!);
  const canal = await conexion.createChannel();
  await canal.assertExchange(INTERCAMBIO, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
  await canal.bindQueue(queue, INTERCAMBIO, 'InsumoGuardado');
  await canal.bindQueue(queue, INTERCAMBIO, 'InsumoEliminado');
  await canal.consume(queue, (m) => m && avisos.push(JSON.parse(m.content.toString())), { noAck: true });

  catalogo = createServer((req, res) => {
    const id = Number(/\/interno\/insumos\/(\d+)\/recetas/.exec(req.url ?? '')?.[1]);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ recetas: recetasPorInsumo.get(id) ?? 0 }));
  });
  await new Promise<void>((ok) => catalogo.listen(4998, '127.0.0.1', ok));

  const unidades = (await request(app).get('/api/insumos/unidades').set(almacenero).expect(200)).body;
  kilogramo = unidades.find((u: { nombre: string }) => u.nombre === 'Kilogramo').id;
  const almacenes = (await request(app).get('/api/almacenes').set(almacenero).expect(200)).body;
  seco = almacenes.find((a: { tipoConservacion: string }) => a.tipoConservacion === 'Seco').id;
});

afterAll(async () => {
  await conexion.close();
  await cerrarEventos();
  await new Promise((ok) => catalogo.close(ok));
  await borrarCreados();
  await prisma.$disconnect();
  await cerrarServidorDeClave();
});

describe('HU-09 · Inventario avisa sus insumos al catálogo', () => {
  it('al crear y al cambiar un insumo publica InsumoGuardado, con la unidad abreviada', async () => {
    const creado = (await crearInsumo('Quinua')).body;
    const alta = await aviso((e) => e.tipo === 'InsumoGuardado' && e.datos.id === creado.id);
    expect(alta.datos).toEqual({ id: creado.id, nombre: 'Quinua', unidad: 'kg', costoUnitario: 0, activo: true });

    await request(app).put(`/api/insumos/${creado.id}`).set(almacenero).send({ nombre: 'Quinua real' }).expect(200);
    await aviso((e) => e.datos.id === creado.id && e.datos.nombre === 'Quinua real');
  });

  it('una compra cambia el costo del insumo y lo avisa', async () => {
    const creado = (await crearInsumo('Avena')).body;
    await request(app)
      .post('/api/ingresos')
      .set(almacenero)
      .send({
        motivo: 'Compra',
        proveedor: 'Mayorista',
        insumos: [{ idIngrediente: creado.id, idAlmacen: seco, cantidad: 10, costoUnitario: 12.5 }],
      })
      .expect(201);
    await aviso((e) => e.datos.id === creado.id && e.datos.costoUnitario === 12.5);
  });

  it('la lista completa queda disponible para que el catálogo se ponga al día al arrancar', async () => {
    const lista = (await request(app).get('/interno/insumos').expect(200)).body as DatosInsumo[];
    expect(lista.find((i) => i.nombre === 'Avena')).toMatchObject({ unidad: 'kg', costoUnitario: 12.5, activo: true });
  });

  it('no elimina un insumo que una receta del catálogo usa; uno que ninguna usa, sí, y lo avisa', async () => {
    process.env.CATALOGO_URL = 'http://127.0.0.1:4998';
    const usado = (await crearInsumo('Chía')).body;
    const libre = (await crearInsumo('Linaza')).body;
    recetasPorInsumo.set(usado.id, 2);

    const r = await request(app).delete(`/api/insumos/${usado.id}`).set(almacenero).expect(409);
    expect(r.body.error).toContain('forma parte de 2 receta(s)');

    await request(app).delete(`/api/insumos/${libre.id}`).set(almacenero).expect(204);
    await aviso((e) => e.tipo === 'InsumoEliminado' && e.datos.id === libre.id);
  });

  it('si el catálogo no responde, no elimina: no puede saber si alguna receta lo usa', async () => {
    process.env.CATALOGO_URL = 'http://127.0.0.1:9';
    const creado = (await crearInsumo('Sésamo')).body;
    const r = await request(app).delete(`/api/insumos/${creado.id}`).set(almacenero).expect(503);
    expect(r.body.error).toContain('catálogo no responde');
  });
});
