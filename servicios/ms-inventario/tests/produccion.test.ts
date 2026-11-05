import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
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
import { productoGuardado } from '../src/services/replica.service.js';
import { ordenFinalizada } from '../src/services/produccion.service.js';
import { registroDeEventos } from '../src/models/evento.model.js';
import { prisma } from '../src/config/prisma.js';

/**
 * HU-10 · lo que hace ms-inventario cuando ms-catalogo finaliza una orden de
 * producción: «al finalizar se descuentan los insumos y se suma el producto».
 *
 * La orden llega con el evento OrdenFinalizada por el RabbitMQ de docker
 * compose; la reserva la pidió antes ms-catalogo (aquí se pide igual, por
 * /interno/reservas). Cada prueba usa insumos, un producto y un almacén propios,
 * y al terminar los borra.
 */
const SERVICIO = `prueba-produccion-${Math.random().toString(36).slice(2, 8)}`;
const URL_RABBIT = process.env.RABBITMQ_URL!;
const almacenero = cabecera({
  idUsuario: 5,
  nombre: 'Ana',
  apellido: 'Almacén',
  rol: 'Empleado',
  cargo: 'Almacenero',
  permisos: ['STOCK_CONSULTAR', 'INSUMO_GESTIONAR', 'INGRESO_REGISTRAR', 'ALMACEN_GESTIONAR'],
});
const ID_PRODUCTO = 962;
const EMPLEADO = { id: 7044, nombre: 'Carlos', apellido: 'Cocina' };
let avena: number;
let leche: number;
let seco: number;
let camara: number;
let despensa: number;

/* ---------- eventos ---------- */
let conexion: ChannelModel;
const registradas: Evento<{ idOrden: number; idNotaEgreso: number; idNotaIngreso: number | null; costoTotal: number }>[] = [];

async function publicarOrden(datos: object): Promise<string> {
  const evento: Evento = { id: crypto.randomUUID(), tipo: 'OrdenFinalizada', origen: 'ms-catalogo', fecha: new Date().toISOString(), datos };
  const c = await amqp.connect(URL_RABBIT);
  const canal = await c.createConfirmChannel();
  canal.publish(INTERCAMBIO, 'OrdenFinalizada', Buffer.from(JSON.stringify(evento)), { persistent: true });
  await canal.waitForConfirms();
  await c.close();
  return evento.id;
}

async function esperar<T>(que: string, buscar: () => Promise<T | undefined> | T | undefined): Promise<T> {
  for (let i = 0; i < 80; i++) {
    const v = await buscar();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no llegó: ${que}`);
}
const registradaDe = (idOrden: number) =>
  esperar(`ProduccionRegistrada de la orden ${idOrden}`, () => registradas.find((e) => e.datos.idOrden === idOrden));
const procesado = (idEvento: string) =>
  esperar(`el evento ${idEvento}`, async () => ((await registroDeEventos.yaProcesado(idEvento)) ? true : undefined));

/* ---------- datos ---------- */
const reservar = (id: string, insumos: object[], destino?: object) =>
  request(app).post('/interno/reservas').send({ id, origen: 'ms-catalogo', insumos, destino }).expect(201);
const orden = (idOrden: number, cantidadObtenida: number) => ({
  idOrden,
  idReserva: `orden-prueba-${idOrden}`,
  idProducto: ID_PRODUCTO,
  cantidadObtenida,
  empleado: EMPLEADO,
});
const stockInsumo = async (id: number, idAlmacen: number) =>
  Number((await prisma.ingrediente_almacen.findUnique({ where: { id_ingrediente_id_almacen: { id_ingrediente: id, id_almacen: idAlmacen } } }))?.stock_actual ?? 0);
const stockProducto = async (idAlmacen: number) =>
  (await prisma.producto_almacen.findUnique({ where: { id_producto_id_almacen: { id_producto: ID_PRODUCTO, id_almacen: idAlmacen } } }))?.stock_actual ?? 0;

async function crearInsumo(nombre: string, unidad: string, tipoConservacion: string) {
  const unidades = (await request(app).get('/api/insumos/unidades').set(almacenero).expect(200)).body;
  const idUnidad = unidades.find((u: { nombre: string }) => u.nombre === unidad).id;
  return (
    await request(app).post('/api/insumos').set(almacenero).send({ nombre, idUnidad, stockMinimo: 0, tipoConservacion }).expect(201)
  ).body.id as number;
}
const ingresar = (idIngrediente: number, idAlmacen: number, cantidad: number, costoUnitario: number) =>
  request(app)
    .post('/api/ingresos')
    .set(almacenero)
    .send({ motivo: 'Compra', proveedor: 'Proveedor de prueba', insumos: [{ idIngrediente, idAlmacen, cantidad, costoUnitario }] })
    .expect(201);

beforeAll(async () => {
  suscribir('OrdenFinalizada', ordenFinalizada);
  await conectarEventos({ servicio: SERVICIO, registro: registroDeEventos });
  await eventosListos();
  conexion = await amqp.connect(URL_RABBIT);
  const canal = await conexion.createChannel();
  await canal.assertExchange(INTERCAMBIO, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
  await canal.bindQueue(queue, INTERCAMBIO, 'ProduccionRegistrada');
  await canal.consume(queue, (m) => m && registradas.push(JSON.parse(m.content.toString())), { noAck: true });

  const almacenes = (await request(app).get('/api/almacenes').set(almacenero).expect(200)).body;
  seco = almacenes.find((a: { tipoConservacion: string }) => a.tipoConservacion === 'Seco').id;
  camara = almacenes.find((a: { tipoConservacion: string }) => a.tipoConservacion === 'Refrigerado').id;
  // Un segundo almacén seco: la avena está repartida entre los dos.
  despensa = (
    await request(app).post('/api/almacenes').set(almacenero).send({ nombre: 'Despensa de prueba', tipoConservacion: 'Seco' }).expect(201)
  ).body.id;

  avena = await crearInsumo('Avena de prueba', 'Kilogramo', 'Seco');
  leche = await crearInsumo('Leche de prueba', 'Litro', 'Refrigerado');
  await ingresar(avena, seco, 3, 10);
  await ingresar(avena, despensa, 2, 10);
  await ingresar(leche, camara, 4, 5);

  await productoGuardado({
    id: crypto.randomUUID(),
    tipo: 'ProductoGuardado',
    origen: 'ms-catalogo',
    fecha: new Date().toISOString(),
    datos: { id: ID_PRODUCTO, nombre: 'Granola de prueba', tipoConservacion: 'Refrigerado', activo: true },
  });
});

afterAll(async () => {
  await conexion.close();
  await cerrarEventos();
  const c = await amqp.connect(URL_RABBIT);
  const canal = await c.createChannel();
  await canal.deleteQueue(colaDe(SERVICIO));
  await canal.deleteQueue(colaFallidosDe(SERVICIO));
  await c.close();

  // Deja la base como estaba: las demás pruebas cuentan insumos, productos y almacenes.
  const insumos = [avena, leche];
  const reservas = (await prisma.reserva.findMany({ where: { id_reserva: { startsWith: 'orden-prueba-' } } })).map((r) => r.id_reserva);
  await prisma.detalle_reserva_insumo.deleteMany({ where: { id_reserva: { in: reservas } } });
  await prisma.reserva.deleteMany({ where: { id_reserva: { in: reservas } } });
  const egresos = (await prisma.detalle_egreso_insumo.findMany({ where: { id_ingrediente: { in: insumos } } })).map((d) => d.id_nota_egreso);
  const ingresos = [
    ...(await prisma.detalle_ingreso_insumo.findMany({ where: { id_ingrediente: { in: insumos } } })).map((d) => d.id_nota_ingreso),
    ...(await prisma.detalle_ingreso_producto.findMany({ where: { id_producto: ID_PRODUCTO } })).map((d) => d.id_nota_ingreso),
  ];
  await prisma.detalle_egreso_insumo.deleteMany({ where: { id_ingrediente: { in: insumos } } });
  await prisma.detalle_ingreso_insumo.deleteMany({ where: { id_ingrediente: { in: insumos } } });
  await prisma.detalle_ingreso_producto.deleteMany({ where: { id_producto: ID_PRODUCTO } });
  await prisma.nota_egreso.deleteMany({ where: { id_nota_egreso: { in: egresos } } });
  await prisma.nota_ingreso.deleteMany({ where: { id_nota_ingreso: { in: ingresos } } });
  await prisma.ingrediente_almacen.deleteMany({ where: { id_ingrediente: { in: insumos } } });
  await prisma.producto_almacen.deleteMany({ where: { id_producto: ID_PRODUCTO } });
  await prisma.ingrediente.deleteMany({ where: { id_ingrediente: { in: insumos } } });
  await prisma.producto.deleteMany({ where: { id_producto: ID_PRODUCTO } });
  await prisma.almacen.deleteMany({ where: { id_almacen: despensa } });
  await prisma.empleado.deleteMany({ where: { id_empleado: EMPLEADO.id } });
  await prisma.$disconnect();
  await cerrarServidorDeClave();
});

describe('HU-10 · Inventario registra la producción de una orden finalizada', () => {
  it('descuenta los insumos, suma el producto y avisa las notas con el costo real', async () => {
    await reservar('orden-prueba-90001', [{ idIngrediente: avena, cantidad: 4.5 }, { idIngrediente: leche, cantidad: 2 }], { idProducto: ID_PRODUCTO });
    await publicarOrden(orden(90001, 4));
    const aviso = await registradaDe(90001);

    // 4,5 kg de avena a 10 y 2 L de leche a 5.
    expect(aviso.datos).toMatchObject({ idOrden: 90001, costoTotal: 55 });

    const egreso = await prisma.nota_egreso.findUniqueOrThrow({
      where: { id_nota_egreso: aviso.datos.idNotaEgreso },
      include: { detalle_egreso_insumo: true },
    });
    expect(egreso).toMatchObject({ motivo: 'Produccion', observacion: 'Orden de producción #90001', id_empleado: EMPLEADO.id });
    // La avena sale del almacén que más tiene y el resto del otro.
    const salidas = egreso.detalle_egreso_insumo.map((d) => [d.id_ingrediente, d.id_almacen, Number(d.cantidad)]);
    expect(salidas).toEqual(expect.arrayContaining([[avena, seco, 3], [avena, despensa, 1.5], [leche, camara, 2]]));
    expect(salidas).toHaveLength(3);

    const ingreso = await prisma.nota_ingreso.findUniqueOrThrow({
      where: { id_nota_ingreso: aviso.datos.idNotaIngreso! },
      include: { detalle_ingreso_producto: true },
    });
    expect(ingreso).toMatchObject({ motivo: 'Produccion', proveedor: null, numero_documento: 'Orden 90001', id_empleado: EMPLEADO.id });
    // El costo se reparte entre las 4 porciones obtenidas: 55 / 4.
    expect(ingreso.detalle_ingreso_producto.map((d) => [d.id_almacen, d.cantidad, Number(d.costo_unitario)])).toEqual([[camara, 4, 13.75]]);

    expect(await stockInsumo(avena, seco)).toBe(0);
    expect(await stockInsumo(avena, despensa)).toBe(0.5);
    expect(await stockInsumo(leche, camara)).toBe(2);
    expect(await stockProducto(camara)).toBe(4);
    expect((await prisma.reserva.findUniqueOrThrow({ where: { id_reserva: 'orden-prueba-90001' } })).estado).toBe('Consumida');
    // La nota muestra quién finalizó la orden.
    expect(await prisma.empleado.findUnique({ where: { id_empleado: EMPLEADO.id } })).toMatchObject({ nombre: 'Carlos', apellido: 'Cocina' });
  });

  it('si OrdenFinalizada llega dos veces, la producción se registra una sola vez', async () => {
    const notasAntes = await prisma.nota_egreso.count({ where: { observacion: 'Orden de producción #90001' } });
    const id = await publicarOrden(orden(90001, 4));
    await procesado(id);
    expect(await prisma.nota_egreso.count({ where: { observacion: 'Orden de producción #90001' } })).toBe(notasAntes);
    expect(await stockProducto(camara)).toBe(4);
    expect(registradas.filter((e) => e.datos.idOrden === 90001)).toHaveLength(1);
  });

  it('si no se obtuvo nada, solo descuenta los insumos (todo es merma)', async () => {
    await reservar('orden-prueba-90002', [{ idIngrediente: leche, cantidad: 1 }]);
    await publicarOrden(orden(90002, 0));
    const aviso = await registradaDe(90002);
    expect(aviso.datos).toMatchObject({ idOrden: 90002, idNotaIngreso: null, costoTotal: 5 });
    expect(await stockInsumo(leche, camara)).toBe(1);
    expect(await stockProducto(camara)).toBe(4);
  });

  it('una reserva liberada ya no se consume: el evento termina en la cola de fallidos sin tocar el stock', async () => {
    await reservar('orden-prueba-90003', [{ idIngrediente: leche, cantidad: 1 }], { idProducto: ID_PRODUCTO });
    await request(app).post('/interno/reservas/orden-prueba-90003/liberar').expect(200);
    await publicarOrden(orden(90003, 2));

    const canal = await conexion.createChannel();
    const enFallidos = await esperar('el evento en la cola de fallidos', async () => {
      const { messageCount } = await canal.checkQueue(colaFallidosDe(SERVICIO));
      return messageCount > 0 ? messageCount : undefined;
    });
    await canal.close();
    expect(enFallidos).toBe(1);
    expect(await stockInsumo(leche, camara)).toBe(1);
    expect(await stockProducto(camara)).toBe(4);
    expect(registradas.some((e) => e.datos.idOrden === 90003)).toBe(false);
  });
});
