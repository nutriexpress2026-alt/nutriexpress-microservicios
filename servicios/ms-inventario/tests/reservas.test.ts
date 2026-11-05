import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { app } from '../src/app.js';
import { productoGuardado } from '../src/services/replica.service.js';
import { pedidoCancelado } from '../src/services/reserva.service.js';
import { prisma } from '../src/config/prisma.js';

/**
 * HU-17 Reservar y liberar stock: «una reserva sin stock se rechaza; una reserva
 * liberada vuelve al disponible; repetir la misma reserva no descuenta dos veces».
 *
 * Las reservas las piden otros servicios por /interno/reservas. Cada prueba usa
 * un insumo y un producto propios, con stock conocido, y al terminar los borra.
 */
const almacenero = cabecera({
  idUsuario: 5,
  nombre: 'Ana',
  apellido: 'Almacén',
  rol: 'Empleado',
  cargo: 'Almacenero',
  permisos: ['STOCK_CONSULTAR', 'INSUMO_GESTIONAR', 'INGRESO_REGISTRAR', 'EGRESO_REGISTRAR'],
});
const ID_PRODUCTO = 961;
let harina: number;
let seco: number;
let camara: number;
let n = 0;
const nuevaId = () => `prueba-${Date.now()}-${++n}`;

const reservar = (cuerpo: object) => request(app).post('/interno/reservas').send({ origen: 'ms-prueba', ...cuerpo });
const kilos = (cantidad: number, id = nuevaId()) => reservar({ id, insumos: [{ idIngrediente: harina, cantidad }] });
const disponibleDeHarina = async () =>
  (
    await request(app)
      .post('/interno/reservas/verificar')
      .send({ insumos: [{ idIngrediente: harina, cantidad: 0.001 }] })
  ).status === 200;

beforeAll(async () => {
  const unidades = (await request(app).get('/api/insumos/unidades').set(almacenero).expect(200)).body;
  const kg = unidades.find((u: { nombre: string }) => u.nombre === 'Kilogramo').id;
  const almacenes = (await request(app).get('/api/almacenes').set(almacenero).expect(200)).body;
  seco = almacenes.find((a: { tipoConservacion: string }) => a.tipoConservacion === 'Seco').id;
  camara = almacenes.find((a: { tipoConservacion: string }) => a.tipoConservacion === 'Refrigerado').id;

  harina = (
    await request(app)
      .post('/api/insumos')
      .set(almacenero)
      .send({ nombre: 'Harina de prueba', idUnidad: kg, stockMinimo: 0, tipoConservacion: 'Seco' })
      .expect(201)
  ).body.id;
  await request(app)
    .post('/api/ingresos')
    .set(almacenero)
    .send({ motivo: 'Compra', proveedor: 'Molino', insumos: [{ idIngrediente: harina, idAlmacen: seco, cantidad: 10, costoUnitario: 6 }] })
    .expect(201);

  await productoGuardado({
    id: crypto.randomUUID(),
    tipo: 'ProductoGuardado',
    origen: 'ms-catalogo',
    fecha: new Date().toISOString(),
    datos: { id: ID_PRODUCTO, nombre: 'Pan de prueba', tipoConservacion: 'Refrigerado', activo: true },
  });
  await request(app)
    .post('/api/ingresos')
    .set(almacenero)
    .send({ motivo: 'Ajuste', productos: [{ idProducto: ID_PRODUCTO, idAlmacen: camara, cantidad: 5, costoUnitario: 3 }] })
    .expect(201);
});

afterAll(async () => {
  // Deja la base como estaba: las demás pruebas cuentan insumos y productos.
  const reservas = (await prisma.reserva.findMany({ where: { id_reserva: { startsWith: 'prueba-' } } })).map((r) => r.id_reserva);
  await prisma.detalle_reserva_insumo.deleteMany({ where: { id_reserva: { in: reservas } } });
  await prisma.detalle_reserva_producto.deleteMany({ where: { id_reserva: { in: reservas } } });
  await prisma.reserva.deleteMany({ where: { id_reserva: { in: reservas } } });
  const egresos = (await prisma.detalle_egreso_insumo.findMany({ where: { id_ingrediente: harina } })).map((d) => d.id_nota_egreso);
  const ingresos = [
    ...(await prisma.detalle_ingreso_insumo.findMany({ where: { id_ingrediente: harina } })).map((d) => d.id_nota_ingreso),
    ...(await prisma.detalle_ingreso_producto.findMany({ where: { id_producto: ID_PRODUCTO } })).map((d) => d.id_nota_ingreso),
  ];
  await prisma.detalle_egreso_insumo.deleteMany({ where: { id_ingrediente: harina } });
  await prisma.detalle_ingreso_insumo.deleteMany({ where: { id_ingrediente: harina } });
  await prisma.detalle_ingreso_producto.deleteMany({ where: { id_producto: ID_PRODUCTO } });
  await prisma.nota_egreso.deleteMany({ where: { id_nota_egreso: { in: egresos } } });
  await prisma.nota_ingreso.deleteMany({ where: { id_nota_ingreso: { in: ingresos } } });
  await prisma.ingrediente_almacen.deleteMany({ where: { id_ingrediente: harina } });
  await prisma.producto_almacen.deleteMany({ where: { id_producto: ID_PRODUCTO } });
  await prisma.ingrediente.deleteMany({ where: { id_ingrediente: harina } });
  await prisma.producto.deleteMany({ where: { id_producto: ID_PRODUCTO } });
  await prisma.$disconnect();
  await cerrarServidorDeClave();
});

describe('HU-17 · Reservar y liberar stock', () => {
  it('reserva lo que hay disponible, con el costo de lo reservado', async () => {
    const r = await kilos(4).expect(201);
    expect(r.body).toMatchObject({ estado: 'Activa', origen: 'ms-prueba', costoInsumos: 24 });
    expect(r.body.insumos[0]).toMatchObject({ nombre: 'Harina de prueba', unidad: 'kg', cantidad: 4, costoUnitario: 6 });
    await request(app).post(`/interno/reservas/${r.body.id}/liberar`).expect(200);
  });

  it('una reserva sin stock disponible se rechaza y dice qué falta', async () => {
    const r = await kilos(10.5).expect(409);
    expect(r.body.error).toContain('Harina de prueba: se necesitan 10,5 kg y hay 10 kg disponibles');
  });

  it('repetir la misma reserva no descuenta dos veces', async () => {
    const id = nuevaId();
    await kilos(6, id).expect(201);
    const repetida = await kilos(6, id).expect(200);
    expect(repetida.body.id).toBe(id);
    // Quedan 4 disponibles, no -2: cabe una reserva de 4 justos.
    const resto = await kilos(4).expect(201);
    expect(await disponibleDeHarina()).toBe(false);
    await request(app).post(`/interno/reservas/${id}/liberar`).expect(200);
    await request(app).post(`/interno/reservas/${resto.body.id}/liberar`).expect(200);
  });

  it('una reserva liberada vuelve al disponible; liberar dos veces no es un error', async () => {
    const r = await kilos(10).expect(201);
    await kilos(1).expect(409);
    const liberada = await request(app).post(`/interno/reservas/${r.body.id}/liberar`).expect(200);
    expect(liberada.body.estado).toBe('Liberada');
    await request(app).post(`/interno/reservas/${r.body.id}/liberar`).expect(200);
    const otra = await kilos(10).expect(201);
    await request(app).post(`/interno/reservas/${otra.body.id}/liberar`).expect(200);
    await request(app).post('/interno/reservas/no-existe/liberar').expect(404);
  });

  it('PedidoCancelado libera la reserva del pedido (y uno repetido o sin reserva no falla)', async () => {
    const r = await kilos(10).expect(201);
    await kilos(1).expect(409);
    await pedidoCancelado({ datos: { idReserva: r.body.id } });
    expect((await request(app).get(`/interno/reservas/${r.body.id}`).expect(200)).body.estado).toBe('Liberada');
    await pedidoCancelado({ datos: { idReserva: r.body.id } });
    await pedidoCancelado({ datos: { idReserva: 'pedido-que-no-existe' } });
    expect(await disponibleDeHarina()).toBe(true);
  });

  it('una reserva liberada se puede volver a pedir con el mismo id', async () => {
    const id = nuevaId();
    await kilos(3, id).expect(201);
    await request(app).post(`/interno/reservas/${id}/liberar`).expect(200);
    const otraVez = await kilos(5, id).expect(201);
    expect(otraVez.body).toMatchObject({ id, estado: 'Activa', costoInsumos: 30 });
    await request(app).post(`/interno/reservas/${id}/liberar`).expect(200);
  });

  it('dos reservas a la vez no se reparten más de lo que hay', async () => {
    const [a, b] = await Promise.all([kilos(6), kilos(6)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const ganadora = a.status === 201 ? a : b;
    await request(app).post(`/interno/reservas/${ganadora.body.id}/liberar`).expect(200);
  });

  it('una nota de egreso manual no puede llevarse lo reservado', async () => {
    const r = await kilos(8).expect(201);
    const merma = await request(app)
      .post('/api/egresos')
      .set(almacenero)
      .send({ motivo: 'Merma', insumos: [{ idIngrediente: harina, idAlmacen: seco, cantidad: 5 }] })
      .expect(409);
    expect(merma.body.error).toContain('8 kg están reservados para otra operación y se pueden sacar hasta 2 kg');
    await request(app)
      .post('/api/egresos')
      .set(almacenero)
      .send({ motivo: 'Merma', insumos: [{ idIngrediente: harina, idAlmacen: seco, cantidad: 2 }] })
      .expect(201);
    await request(app).post(`/interno/reservas/${r.body.id}/liberar`).expect(200);
  });

  it('verificar dice si alcanza y cuánto cuesta, sin reservar', async () => {
    const v = await request(app).post('/interno/reservas/verificar').send({ insumos: [{ idIngrediente: harina, cantidad: 8 }] }).expect(200);
    expect(v.body.costoInsumos).toBe(48);
    // No reservó: la reserva completa sigue cabiendo.
    const r = await kilos(8).expect(201);
    await request(app).post(`/interno/reservas/${r.body.id}/liberar`).expect(200);
  });

  it('también reserva productos terminados (los pedidos del Sprint 4)', async () => {
    const r = await reservar({ id: nuevaId(), productos: [{ idProducto: ID_PRODUCTO, cantidad: 5 }] }).expect(201);
    expect(r.body.productos).toEqual([{ idProducto: ID_PRODUCTO, nombre: 'Pan de prueba', cantidad: 5 }]);
    await reservar({ id: nuevaId(), productos: [{ idProducto: ID_PRODUCTO, cantidad: 1 }] }).expect(409);
    // El catálogo ve lo reservado, y ofrece al cliente solo lo que queda disponible (HU-21).
    const existencias = (await request(app).get('/interno/productos/existencias').query({ ids: String(ID_PRODUCTO) })).body;
    expect(existencias[0]).toMatchObject({ stockTotal: 5, reservado: 5 });
    await request(app).post(`/interno/reservas/${r.body.id}/liberar`).expect(200);
  });

  it('para producir, deduce el almacén de destino del producto o pide elegirlo', async () => {
    const r = await reservar({ id: nuevaId(), insumos: [{ idIngrediente: harina, cantidad: 1 }], destino: { idProducto: ID_PRODUCTO } }).expect(201);
    expect(r.body.almacenDestino).toEqual({ id: camara, nombre: expect.any(String) });
    const mal = await reservar({
      id: nuevaId(),
      insumos: [{ idIngrediente: harina, cantidad: 1 }],
      destino: { idProducto: ID_PRODUCTO, idAlmacen: seco },
    }).expect(409);
    expect(mal.body.error).toContain('necesita conservación Refrigerado');
    await request(app).post(`/interno/reservas/${r.body.id}/liberar`).expect(200);
  });

  it('las rutas de reserva no se alcanzan desde fuera del gateway', async () => {
    await request(app).post('/interno/reservas').set('X-Forwarded-For', '1.2.3.4').send({}).expect(404);
  });
});
