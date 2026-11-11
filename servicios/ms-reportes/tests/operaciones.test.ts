import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cerrarServiciosFalsos, control, operaciones } from './servicios-falsos.js';
import { app } from '../src/app.js';
import { mongo } from '../src/config/mongo.js';

/** HU-30 · Reporte de producción y de movimientos de inventario (composición por API). */
const admin = cabecera({ idUsuario: 1, rol: 'Administrador', cargo: 'Administrador', permisos: ['ORDEN_PRODUCCION_GESTIONAR', 'STOCK_CONSULTAR'] });
const vendedor = cabecera({ idUsuario: 3, rol: 'Empleado', cargo: 'Vendedor', permisos: ['VENTA_LEER'] });
const RANGO = 'desde=2026-11-20&hasta=2026-11-30';

afterAll(async () => {
  await mongo.close();
  await cerrarServiciosFalsos();
  await cerrarServidorDeClave();
});

describe('HU-30 · Producción', () => {
  it('suma lo obtenido, la merma y el costo guardado de cada orden', async () => {
    operaciones.ordenes = [
      {
        idOrden: 1, fecha: '2026-11-26T15:00:00.000Z', idProducto: 1, producto: 'Ensalada Cesar', receta: 'Clásica',
        cantidad: 10, cantidadObtenida: 9, costoTotal: 90,
        insumos: [
          { idInsumo: 1, insumo: 'Lechuga', unidad: 'kg', cantidad: 2, costoUnitario: 15 },
          { idInsumo: 2, insumo: 'Pollo', unidad: 'kg', cantidad: 1.5, costoUnitario: 40 },
        ],
      },
      {
        idOrden: 2, fecha: '2026-11-27T15:00:00.000Z', idProducto: 2, producto: 'Jugo verde', receta: 'Base',
        cantidad: 5, cantidadObtenida: 5, costoTotal: null,
        insumos: [{ idInsumo: 3, insumo: 'Espinaca', unidad: 'kg', cantidad: 0.5, costoUnitario: 20 }],
      },
    ];
    const r = await request(app).get(`/api/reportes/produccion?${RANGO}`).set(admin).expect(200);
    expect(r.body.resumen).toEqual({ corridas: 2, unidades: 14, merma: 1, costoTotal: 100, costoUnitarioPromedio: 7.14 });
    expect(r.body.insumosConsumidos[0]).toEqual({ insumo: 'Pollo', unidad: 'kg', cantidad: 1.5, costo: 60 });
    expect(r.body.corridas[0]).toMatchObject({ idOrden: 1, cantidad: 9, merma: 1, costoUnitario: 10 });
    // El período viaja a ms-catalogo como el día completo en hora de La Paz.
    expect(decodeURIComponent(operaciones.consultas.at(-1)!)).toMatch(/desde=2026-11-20T04:00:00.000Z&hasta=2026-12-01T03:59:59.999Z/);
  });

  it('se descarga en PDF', async () => {
    const r = await request(app).get(`/api/reportes/produccion.pdf?${RANGO}`).set(admin).buffer().expect(200);
    expect(r.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('pide el permiso de gestionar órdenes', async () => {
    await request(app).get(`/api/reportes/produccion?${RANGO}`).set(vendedor).expect(403);
  });
});

describe('HU-30 · Movimientos de inventario', () => {
  it('cuenta entradas, salidas (también lo vendido) y la existencia de hoy', async () => {
    operaciones.movimientos = [
      { fecha: '2026-11-21T14:00:00.000Z', tipo: 'Ingreso', motivo: 'Compra', tipoItem: 'Insumo', idItem: 1, item: 'Lechuga', unidad: 'kg', cantidad: 5, costo: 75, referencia: 'Mercado · F-12' },
      { fecha: '2026-11-26T15:00:00.000Z', tipo: 'Egreso', motivo: 'Produccion', tipoItem: 'Insumo', idItem: 1, item: 'Lechuga', unidad: 'kg', cantidad: 2, costo: null, referencia: 'Orden #1' },
      { fecha: '2026-11-26T15:00:00.000Z', tipo: 'Ingreso', motivo: 'Produccion', tipoItem: 'Producto', idItem: 1, item: 'Ensalada Cesar', unidad: 'u', cantidad: 9, costo: 90, referencia: null },
      { fecha: '2026-11-27T18:00:00.000Z', tipo: 'Egreso', motivo: 'Venta', tipoItem: 'Producto', idItem: 1, item: 'Ensalada Cesar', unidad: 'u', cantidad: 3, costo: null, referencia: 'Venta de mostrador' },
    ];
    operaciones.existencias = [
      { tipoItem: 'Insumo', idItem: 1, existencia: 3 },
      { tipoItem: 'Producto', idItem: 1, existencia: 6 },
    ];
    const r = await request(app).get(`/api/reportes/inventario?${RANGO}`).set(admin).expect(200);
    expect(r.body.resumen).toEqual({ ingresos: 2, egresos: 2, costoIngresado: 165 });
    expect(r.body.porItem).toEqual([
      { tipo: 'Insumo', item: 'Lechuga', unidad: 'kg', entradas: 5, salidas: 2, neto: 3, existencia: 3 },
      { tipo: 'Producto', item: 'Ensalada Cesar', unidad: 'u', entradas: 9, salidas: 3, neto: 6, existencia: 6 },
    ]);
    expect(r.body.movimientos.map((m: { motivo: string }) => m.motivo)).toContain('Venta');
  });

  it('se filtra por un insumo o por un producto, no por los dos', async () => {
    await request(app).get(`/api/reportes/inventario?${RANGO}&idIngrediente=1`).set(admin).expect(200);
    expect(operaciones.consultas.at(-1)).toMatch(/idIngrediente=1/);
    await request(app).get(`/api/reportes/inventario?${RANGO}&idIngrediente=1&idProducto=1`).set(admin).expect(400);
  });

  it('si inventario no responde, lo dice en vez de mostrar cifras a medias', async () => {
    control.inventarioCaido = true;
    try {
      const r = await request(app).get(`/api/reportes/inventario?${RANGO}`).set(admin).expect(503);
      expect(r.body.error).toMatch(/ms-inventario/);
    } finally {
      control.inventarioCaido = false;
    }
  });
});
