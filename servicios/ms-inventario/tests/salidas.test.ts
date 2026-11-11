import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { app } from '../src/app.js';
import { productoGuardado } from '../src/services/replica.service.js';
import { prisma } from '../src/config/prisma.js';

/**
 * HU-18, HU-24 · Una venta de mostrador o un pedido entregado consume su reserva
 * con una nota de egreso por venta; HU-19 · anular la venta la devuelve.
 */
const almacenero = cabecera({ idUsuario: 5, nombre: 'Ana', apellido: 'Almacén', rol: 'Empleado', cargo: 'Almacenero', permisos: ['STOCK_CONSULTAR', 'INGRESO_REGISTRAR'] });
const vendedor = { id: 3, nombre: 'Victor', apellido: 'Vendedor' };
const ID_PRODUCTO = 962;
let camara: number;
let n = 0;
const nuevaId = () => `salida-${Date.now()}-${++n}`;

const stock = async () =>
  Number((await prisma.producto_almacen.findMany({ where: { id_producto: ID_PRODUCTO } })).reduce((t, f) => t + Number(f.stock_actual), 0));

async function reservarYConsumir(cantidad: number) {
  const id = nuevaId();
  await request(app).post('/interno/reservas').send({ id, origen: 'ms-ventas', productos: [{ idProducto: ID_PRODUCTO, cantidad }] }).expect(201);
  const r = await request(app).post(`/interno/reservas/${id}/consumir`).send({ observacion: 'Venta de mostrador', empleado: vendedor }).expect(200);
  return { id, salida: r.body };
}

beforeAll(async () => {
  const almacenes = (await request(app).get('/api/almacenes').set(almacenero).expect(200)).body;
  camara = almacenes.find((a: { tipoConservacion: string }) => a.tipoConservacion === 'Refrigerado').id;
  await productoGuardado({
    id: crypto.randomUUID(),
    tipo: 'ProductoGuardado',
    origen: 'ms-catalogo',
    fecha: new Date().toISOString(),
    datos: { id: ID_PRODUCTO, nombre: 'Tarta de prueba', tipoConservacion: 'Refrigerado', activo: true },
  });
  await request(app)
    .post('/api/ingresos')
    .set(almacenero)
    .send({ motivo: 'Ajuste', productos: [{ idProducto: ID_PRODUCTO, idAlmacen: camara, cantidad: 6, costoUnitario: 4 }] })
    .expect(201);
});

afterAll(async () => {
  const reservas = (await prisma.reserva.findMany({ where: { id_reserva: { startsWith: 'salida-' } } })).map((r) => r.id_reserva);
  const egresos = (await prisma.detalle_egreso_producto.findMany({ where: { id_producto: ID_PRODUCTO } })).map((d) => d.id_nota_egreso);
  const ingresos = (await prisma.detalle_ingreso_producto.findMany({ where: { id_producto: ID_PRODUCTO } })).map((d) => d.id_nota_ingreso);
  await prisma.detalle_reserva_producto.deleteMany({ where: { id_reserva: { in: reservas } } });
  await prisma.reserva.deleteMany({ where: { id_reserva: { in: reservas } } });
  await prisma.detalle_egreso_producto.deleteMany({ where: { id_producto: ID_PRODUCTO } });
  await prisma.detalle_ingreso_producto.deleteMany({ where: { id_producto: ID_PRODUCTO } });
  await prisma.nota_egreso.deleteMany({ where: { id_nota_egreso: { in: egresos } } });
  await prisma.nota_ingreso.deleteMany({ where: { id_nota_ingreso: { in: ingresos } } });
  await prisma.producto_almacen.deleteMany({ where: { id_producto: ID_PRODUCTO } });
  await prisma.producto.deleteMany({ where: { id_producto: ID_PRODUCTO } });
  await prisma.$disconnect();
  await cerrarServidorDeClave();
});

describe('HU-18, HU-24 · Consumir la reserva de una venta', () => {
  it('descuenta el stock con una nota de egreso por Venta, del almacén que lo tiene', async () => {
    const { id, salida } = await reservarYConsumir(2);
    expect(salida).toMatchObject({ yaConsumida: false, idNotaEgreso: expect.any(Number) });
    expect(salida.lineas).toEqual([{ idProducto: ID_PRODUCTO, idAlmacen: camara, almacen: expect.any(String), cantidad: 2, costoUnitario: 4 }]);
    expect(await stock()).toBe(4);
    const nota = await prisma.nota_egreso.findUnique({ where: { id_nota_egreso: salida.idNotaEgreso } });
    expect(nota).toMatchObject({ motivo: 'Venta', observacion: 'Venta de mostrador' });
    expect((await request(app).get(`/interno/reservas/${id}`).expect(200)).body.estado).toBe('Consumida');
  });

  it('repetirlo no descuenta dos veces', async () => {
    const { id } = await reservarYConsumir(1);
    const otra = await request(app).post(`/interno/reservas/${id}/consumir`).send({ observacion: 'Otra vez', empleado: vendedor }).expect(200);
    expect(otra.body).toMatchObject({ yaConsumida: true, lineas: [] });
    expect(await stock()).toBe(3);
  });

  it('una reserva que no existe no se consume', async () => {
    await request(app).post('/interno/reservas/no-existe/consumir').send({ observacion: 'x', empleado: vendedor }).expect(404);
  });
});

describe('HU-19 · Devolver lo de una venta anulada', () => {
  it('vuelve al mismo almacén con una nota de ingreso por Devolución, y no suma dos veces', async () => {
    const { salida } = await reservarYConsumir(2);
    expect(await stock()).toBe(1);
    const lineas = salida.lineas.map((l: { idProducto: number; idAlmacen: number; cantidad: number }) => ({ idProducto: l.idProducto, idAlmacen: l.idAlmacen, cantidad: l.cantidad }));
    const r = await request(app).post('/interno/devoluciones').send({ referencia: 'Venta 900 anulada', lineas, empleado: vendedor }).expect(201);
    expect(await stock()).toBe(3);
    const nota = await prisma.nota_ingreso.findUnique({ where: { id_nota_ingreso: r.body.idNotaIngreso } });
    expect(nota).toMatchObject({ motivo: 'Devolucion', numero_documento: 'Venta 900 anulada' });
    const otra = await request(app).post('/interno/devoluciones').send({ referencia: 'Venta 900 anulada', lineas, empleado: vendedor }).expect(201);
    expect(otra.body.idNotaIngreso).toBe(r.body.idNotaIngreso);
    expect(await stock()).toBe(3);
  });

  it('HU-30 · los movimientos del período cuentan lo vendido como salida y dan la existencia de hoy', async () => {
    const desde = new Date(Date.now() - 3600_000).toISOString();
    const hasta = new Date(Date.now() + 3600_000).toISOString();
    const r = await request(app).get(`/interno/movimientos/reporte?desde=${desde}&hasta=${hasta}&idProducto=${ID_PRODUCTO}`).expect(200);
    expect(r.body.item).toBe('Tarta de prueba');
    const motivos = r.body.movimientos.map((m: { tipo: string; motivo: string }) => `${m.tipo} ${m.motivo}`);
    expect(motivos).toContain('Ingreso Ajuste');
    expect(motivos).toContain('Egreso Venta');
    expect(r.body.movimientos.every((m: { idItem: number }) => m.idItem === ID_PRODUCTO)).toBe(true);
    expect(r.body.existencias).toEqual([{ tipoItem: 'Producto', idItem: ID_PRODUCTO, existencia: await stock() }]);
    await request(app).get('/interno/movimientos/reporte?desde=ayer').expect(400);
  });

  it('estas rutas no se alcanzan desde fuera del gateway', async () => {
    await request(app).post('/interno/devoluciones').set('X-Forwarded-For', '1.2.3.4').send({}).expect(404);
  });
});
