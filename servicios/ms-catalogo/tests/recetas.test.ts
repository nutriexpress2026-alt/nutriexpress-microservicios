import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { app } from '../src/app.js';
import { insumoGuardado } from '../src/services/replica.service.js';
import { prisma } from '../src/config/prisma.js';

/**
 * HU-09 Gestionar recetas: «una sola receta activa por producto; los insumos
 * se eligen de los registrados en inventario».
 *
 * Los insumos llegan a la réplica del catálogo con el evento InsumoGuardado; aquí
 * se le pasa el evento directo al manejador (el viaje por RabbitMQ lo prueban
 * eventos y réplicas).
 */
const admin = cabecera({ permisos: ['PRODUCTO_GESTIONAR'] });
const cocinero = cabecera({ idUsuario: 4, rol: 'Empleado', cargo: 'Cocinero', permisos: ['ORDEN_PRODUCCION_GESTIONAR'] });
const cliente = cabecera({ idUsuario: 9, rol: 'Cliente', cargo: null, permisos: ['PEDIDO_LEER'] });

const insumo = (id: number, nombre: string, unidad: string, costoUnitario: number, activo = true) =>
  insumoGuardado({
    id: crypto.randomUUID(),
    tipo: 'InsumoGuardado',
    origen: 'ms-inventario',
    fecha: new Date().toISOString(),
    datos: { id, nombre, unidad, costoUnitario, activo },
  });

let idProducto: number;
const version = (nombre: string, insumos = [{ idIngrediente: 9001, cantidadRequerida: 0.25 }]) => ({
  nombre,
  rendimiento: 4,
  tiempoPreparacionMinutos: 20,
  instrucciones: 'Picar, mezclar y servir',
  divisible: true,
  insumos,
});
const crear = (cuerpo: object, id = idProducto) =>
  request(app).post(`/api/productos/${id}/recetas`).set(admin).send(cuerpo);

beforeAll(async () => {
  await insumo(9001, 'Tomate', 'kg', 8);
  await insumo(9002, 'Lechuga', 'u', 3.5);
  await insumo(9003, 'Pollo', 'kg', 30);
  await insumo(9004, 'Aceite viejo', 'L', 10, false);
  // Un producto propio: las recetas lo dejan sin poder eliminarse, y no hay que
  // cambiarle eso a los productos que usan las demás pruebas.
  const categorias = (await request(app).get('/api/catalogo/categorias').expect(200)).body;
  idProducto = (
    await request(app)
      .post('/api/productos')
      .set(admin)
      .send({ nombre: 'Ensalada de prueba', precioVenta: 25, idCategoria: categorias[0].id, tipoConservacion: 'Refrigerado' })
      .expect(201)
  ).body.id;
});

afterAll(async () => {
  // Deja la base como estaba: las demás pruebas cuentan los productos del catálogo.
  await prisma.receta.deleteMany({ where: { id_producto: idProducto } });
  await prisma.producto.deleteMany({ where: { id_producto: idProducto } });
  await prisma.insumo.deleteMany({ where: { id_ingrediente: { gte: 9001, lte: 9005 } } });
  await prisma.$disconnect();
  await cerrarServidorDeClave();
});

describe('HU-09 · Versiones de receta', () => {
  it('una versión nace inactiva, con sus insumos y el costo de una corrida', async () => {
    const r = await crear(
      version('Base', [
        { idIngrediente: 9001, cantidadRequerida: 0.25 },
        { idIngrediente: 9002, cantidadRequerida: 2 },
      ]),
    ).expect(201);
    expect(r.body).toMatchObject({ nombre: 'Base', activa: false, rendimiento: 4, divisible: true });
    expect(r.body.insumos).toEqual([
      { idIngrediente: 9001, nombre: 'Tomate', unidad: 'kg', cantidadRequerida: 0.25, insumoActivo: true, costoUnitario: 8 },
      { idIngrediente: 9002, nombre: 'Lechuga', unidad: 'u', cantidadRequerida: 2, insumoActivo: true, costoUnitario: 3.5 },
    ]);
    // 0,25 kg × 8 + 2 u × 3,5 = 2 + 7
    expect(r.body.costoCorrida).toBe(9);
  });

  it('una sola receta activa por producto: activar otra desactiva la anterior', async () => {
    const v1 = (await crear(version('Primera')).expect(201)).body;
    const v2 = (await crear(version('Segunda')).expect(201)).body;

    await request(app).post(`/api/recetas/${v1.id}/activar`).set(admin).expect(200);
    const activada = await request(app).post(`/api/recetas/${v2.id}/activar`).set(admin).expect(200);
    expect(activada.body.activa).toBe(true);

    const lista = (await request(app).get(`/api/productos/${idProducto}/recetas`).set(admin).expect(200)).body;
    expect(lista.filter((r: { activa: boolean }) => r.activa).map((r: { id: number }) => r.id)).toEqual([v2.id]);
    // La activa primero.
    expect(lista[0].id).toBe(v2.id);
  });

  it('los insumos se eligen de los registrados en inventario, y activos', async () => {
    const inexistente = await crear(version('Inexistente', [{ idIngrediente: 99999, cantidadRequerida: 1 }])).expect(404);
    expect(inexistente.body.error).toContain('99999');
    const deBaja = await crear(version('De baja', [{ idIngrediente: 9004, cantidadRequerida: 1 }])).expect(409);
    expect(deBaja.body.error).toContain('Aceite viejo');
  });

  it('valida: al menos un insumo, sin repetir, cantidades al gramo y rendimiento entero', async () => {
    await crear(version('Vacía', [])).expect(400);
    await crear(
      version('Repetida', [
        { idIngrediente: 9001, cantidadRequerida: 1 },
        { idIngrediente: 9001, cantidadRequerida: 2 },
      ]),
    ).expect(400);
    await crear(version('Al miligramo', [{ idIngrediente: 9001, cantidadRequerida: 0.0005 }])).expect(400);
    await crear({ ...version('Media porción'), rendimiento: 2.5 }).expect(400);
  });

  it('editar cambia los datos y reemplaza las líneas', async () => {
    const v = (await crear(version('Para editar')).expect(201)).body;
    const r = await request(app)
      .put(`/api/recetas/${v.id}`)
      .set(admin)
      .send({ ...version('Editada', [{ idIngrediente: 9003, cantidadRequerida: 1.5 }]), rendimiento: 6, divisible: false })
      .expect(200);
    expect(r.body).toMatchObject({ nombre: 'Editada', rendimiento: 6, divisible: false, costoCorrida: 45 });
    expect(r.body.insumos.map((l: { nombre: string }) => l.nombre)).toEqual(['Pollo']);
  });

  it('la versión activa no se elimina; una inactiva sí', async () => {
    const lista = (await request(app).get(`/api/productos/${idProducto}/recetas`).set(admin)).body;
    const activa = lista.find((r: { activa: boolean }) => r.activa);
    const inactiva = lista.find((r: { activa: boolean }) => !r.activa);
    const r = await request(app).delete(`/api/recetas/${activa.id}`).set(admin).expect(409);
    expect(r.body.error).toContain('active otra versión');
    await request(app).delete(`/api/recetas/${inactiva.id}`).set(admin).expect(204);
  });

  it('el costo de la receta sigue al costo del insumo que avisa inventario', async () => {
    const v = (await crear(version('Costo vivo', [{ idIngrediente: 9002, cantidadRequerida: 2 }])).expect(201)).body;
    expect(v.costoCorrida).toBe(7);
    await insumo(9002, 'Lechuga crespa', 'u', 4);
    const despues = (await request(app).get(`/api/productos/${idProducto}/recetas`).set(admin)).body.find(
      (r: { id: number }) => r.id === v.id,
    );
    expect(despues.costoCorrida).toBe(8);
    expect(despues.insumos[0].nombre).toBe('Lechuga crespa');
  });

  it('no se activa una versión que usa un insumo dado de baja', async () => {
    await insumo(9005, 'Queso', 'kg', 40);
    const v = (await crear(version('Con queso', [{ idIngrediente: 9005, cantidadRequerida: 0.1 }])).expect(201)).body;
    await insumo(9005, 'Queso', 'kg', 40, false);
    const r = await request(app).post(`/api/recetas/${v.id}/activar`).set(admin).expect(409);
    expect(r.body.error).toContain('Queso');
  });

  it('quien produce lee las recetas pero no las cambia; el cliente no las ve', async () => {
    await request(app).get(`/api/productos/${idProducto}/recetas`).set(cocinero).expect(200);
    await request(app).post(`/api/productos/${idProducto}/recetas`).set(cocinero).send(version('X')).expect(403);
    await request(app).get(`/api/productos/${idProducto}/recetas`).set(cliente).expect(403);
  });

  it('un producto con recetas no se elimina: se ofrece darlo de baja', async () => {
    const r = await request(app).delete(`/api/productos/${idProducto}`).set(admin).expect(409);
    expect(r.body.error).toContain('receta');
  });

  it('inventario puede preguntar cuántas recetas usan un insumo antes de eliminarlo', async () => {
    const r = await request(app).get('/interno/insumos/9001/recetas').expect(200);
    expect(r.body.recetas).toBeGreaterThan(0);
    expect((await request(app).get('/interno/insumos/123456/recetas').expect(200)).body.recetas).toBe(0);
  });
});
