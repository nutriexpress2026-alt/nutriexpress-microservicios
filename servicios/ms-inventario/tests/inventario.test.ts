import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
const { app } = await import('../src/app.js');
const { productoGuardado } = await import('../src/services/replica.service.js');

afterAll(cerrarServidorDeClave);

const almacenero = cabecera({
  idUsuario: 5,
  nombre: 'Ana',
  apellido: 'Almacén',
  rol: 'Empleado',
  cargo: 'Almacenero',
  permisos: ['STOCK_CONSULTAR', 'INSUMO_GESTIONAR', 'INGRESO_REGISTRAR', 'EGRESO_REGISTRAR'],
});
const cliente = cabecera({ idUsuario: 9, rol: 'Cliente', cargo: null, permisos: ['STOCK_CONSULTAR'] });

let almacenes: { id: number; nombre: string }[];
let tomate: { id: number };
const ID_PRODUCTO = 101;

beforeAll(async () => {
  // Réplica: ms-catalogo avisa (evento ProductoGuardado) que existe el producto 101.
  await productoGuardado({
    id: crypto.randomUUID(),
    tipo: 'ProductoGuardado',
    origen: 'ms-catalogo',
    fecha: new Date().toISOString(),
    datos: { id: ID_PRODUCTO, nombre: 'Jugo verde detox', tipoConservacion: 'Refrigerado', activo: true },
  });
  almacenes = (await request(app).get('/api/almacenes').set(almacenero).expect(200)).body;
  const insumos = (await request(app).get('/api/insumos').set(almacenero).expect(200)).body;
  tomate = insumos.find((i: { nombre: string }) => i.nombre === 'Tomate');
});

const almacen = (nombre: string) => almacenes.find((a) => a.nombre === nombre)!.id;

describe('HU-12 y HU-13 Insumos y almacenes', () => {
  it('lista los insumos y los almacenes de la carga inicial', async () => {
    const insumos = (await request(app).get('/api/insumos').set(almacenero).expect(200)).body;
    expect(insumos.length).toBe(10);
    expect(almacenes.map((a) => a.nombre)).toEqual(expect.arrayContaining(['Almacen Seco', 'Camara Refrigerada']));
  });

  it('un cliente no registra insumos (permiso) y sin sesión responde 401', async () => {
    await request(app).get('/api/insumos').expect(401);
    await request(app).post('/api/insumos').set(cliente).send({}).expect(403);
  });
});

describe('HU-14 Notas de ingreso', () => {
  it('una compra de un perecedero exige lote y vencimiento', async () => {
    const r = await request(app)
      .post('/api/ingresos')
      .set(almacenero)
      .send({
        motivo: 'Compra',
        proveedor: 'Mercado Los Pozos',
        insumos: [{ idIngrediente: tomate.id, idAlmacen: almacen('Camara Refrigerada'), cantidad: 5, costoUnitario: 9 }],
      });
    expect(r.status).toBe(400);
  });

  it('registra la compra, suma el stock y guarda quién la registró (réplica del empleado)', async () => {
    const r = await request(app)
      .post('/api/ingresos')
      .set(almacenero)
      .send({
        motivo: 'Compra',
        proveedor: 'Mercado Los Pozos',
        insumos: [
          {
            idIngrediente: tomate.id,
            idAlmacen: almacen('Camara Refrigerada'),
            cantidad: 5,
            costoUnitario: 9,
            codigoLote: 'T-01',
            fechaVencimiento: '2026-12-31',
          },
        ],
      })
      .expect(201);
    expect(JSON.stringify(r.body)).toContain('Ana Almacén');
  });

  it('ingresa un producto replicado y ms-catalogo ve sus existencias y su costo', async () => {
    await request(app)
      .post('/api/ingresos')
      .set(almacenero)
      .send({
        motivo: 'Ajuste',
        productos: [{ idProducto: ID_PRODUCTO, idAlmacen: almacen('Camara Refrigerada'), cantidad: 12, costoUnitario: 6.5 }],
      })
      .expect(201);
    const r = await request(app).get('/interno/productos/existencias').query({ ids: String(ID_PRODUCTO) }).expect(200);
    expect(r.body[0]).toMatchObject({ idProducto: ID_PRODUCTO, stockTotal: 12, costoPromedio: 6.5 });
  });

  it('un cliente no registra notas: solo el personal', async () => {
    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera({ idUsuario: 9, cargo: null, permisos: ['INGRESO_REGISTRAR'] }))
      .send({ motivo: 'Ajuste', productos: [{ idProducto: ID_PRODUCTO, idAlmacen: almacen('Camara Refrigerada'), cantidad: 1, costoUnitario: 1 }] });
    expect(r.status).toBe(403);
  });
});

describe('HU-15 Notas de egreso', () => {
  it('no deja sacar más de lo que hay', async () => {
    const r = await request(app)
      .post('/api/egresos')
      .set(almacenero)
      .send({ motivo: 'Merma', productos: [{ idProducto: ID_PRODUCTO, idAlmacen: almacen('Camara Refrigerada'), cantidad: 50 }] });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  it('registra la merma y descuenta el stock', async () => {
    await request(app)
      .post('/api/egresos')
      .set(almacenero)
      .send({ motivo: 'Merma', observacion: 'Vencido', productos: [{ idProducto: ID_PRODUCTO, idAlmacen: almacen('Camara Refrigerada'), cantidad: 2 }] })
      .expect(201);
    const r = await request(app).get('/interno/productos/existencias').query({ ids: String(ID_PRODUCTO) }).expect(200);
    expect(r.body[0].stockTotal).toBe(10);
  });
});

describe('HU-16 Stock y réplica de productos', () => {
  it('consulta el stock por almacén', async () => {
    const r = await request(app).get('/api/stock').set(almacenero).expect(200);
    expect(JSON.stringify(r.body)).toContain('Tomate');
  });

  it('ms-catalogo no puede eliminar un producto que ya tuvo movimientos', async () => {
    await request(app).delete(`/interno/productos/${ID_PRODUCTO}`).expect(409);
  });

  it('las rutas internas no responden a peticiones que llegan por el API Gateway', async () => {
    await request(app).get('/interno/productos/existencias').set('X-Forwarded-For', '1.2.3.4').expect(404);
  });
});
