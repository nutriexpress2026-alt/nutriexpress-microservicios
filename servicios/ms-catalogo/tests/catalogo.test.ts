import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
const { app } = await import('../src/app.js');

afterAll(cerrarServidorDeClave);

const admin = cabecera({ permisos: ['PRODUCTO_GESTIONAR', 'CONFIGURACION_GESTIONAR'] });
const cliente = cabecera({ idUsuario: 9, rol: 'Cliente', cargo: null, permisos: ['PEDIDO_LEER'] });

describe('HU-11 Catálogo público y búsqueda', () => {
  it('muestra los productos activos sin iniciar sesión', async () => {
    const r = await request(app).get('/api/catalogo').expect(200);
    expect(r.body.length).toBe(10);
    expect(r.body[0]).toHaveProperty('valorNutricional');
  });

  it('con ms-inventario caído el catálogo se muestra igual, sin existencias (RNF-DIS-01)', async () => {
    const r = await request(app).get('/api/catalogo').expect(200);
    expect(r.body.every((p: { stockDisponible: number }) => p.stockDisponible === 0)).toBe(true);
  });

  it('busca sin distinguir tildes ni mayúsculas', async () => {
    const r = await request(app).get('/api/catalogo').query({ termino: 'MEDITERRÁNEA' }).expect(200);
    expect(r.body.map((p: { nombre: string }) => p.nombre)).toContain('Ensalada mediterranea');
  });

  it('la información del negocio es pública y la encuentra el buscador del encabezado', async () => {
    const info = await request(app).get('/api/negocio').expect(200);
    expect(info.body.nombre).toBe('NutriExpress');
    const r = await request(app).get('/api/negocio/buscar').query({ termino: 'horario' }).expect(200);
    expect(JSON.stringify(r.body)).toContain('Horario');
  });
});

describe('HU-08 Gestionar productos', () => {
  it('sin sesión responde 401 y sin permiso 403', async () => {
    await request(app).post('/api/productos').send({}).expect(401);
    await request(app).post('/api/productos').set(cliente).send({}).expect(403);
  });

  it('el administrador crea un producto con su información nutricional', async () => {
    const categorias = (await request(app).get('/api/catalogo/categorias').expect(200)).body;
    const creado = await request(app)
      .post('/api/productos')
      .set(admin)
      .send({ nombre: 'Batido de frutilla', precioVenta: 17, idCategoria: categorias[0].id, tipoConservacion: 'Refrigerado' })
      .expect(201);
    expect(creado.body).toMatchObject({ nombre: 'Batido de frutilla', precio: 17, activo: true, stockTotal: 0 });

    await request(app)
      .put(`/api/productos/${creado.body.id}/valor-nutricional`)
      .set(admin)
      .send({ calorias: 150, proteinas: 4, carbohidratos: 30, grasas: 2, fibra: 3 })
      .expect(200);
    const publico = (await request(app).get(`/api/catalogo/${creado.body.id}`).expect(200)).body;
    expect(publico.valorNutricional.calorias).toBe(150);
  });

  it('rechaza un precio negativo', async () => {
    const r = await request(app).post('/api/productos').set(admin).send({ nombre: 'Malo', precioVenta: -1, idCategoria: 1 });
    expect(r.status).toBe(400);
  });

  it('no elimina un producto si no puede confirmar con ms-inventario que no tiene movimientos', async () => {
    const r = await request(app).delete('/api/productos/1').set(admin);
    expect(r.status).toBe(503);
  });
});

describe('Rutas internas (para ms-inventario)', () => {
  it('entrega la lista para la réplica de productos', async () => {
    const r = await request(app).get('/interno/productos').expect(200);
    expect(r.body[0]).toEqual(expect.objectContaining({ id: expect.any(Number), nombre: expect.any(String), activo: true }));
  });

  it('no responde si la petición viene del API Gateway', async () => {
    await request(app).get('/interno/productos').set('X-Forwarded-For', '1.2.3.4').expect(404);
  });

  it('HU-21 · da el precio vigente de los productos de un pedido (para ms-pedidos)', async () => {
    const [primero] = (await request(app).get('/interno/productos').expect(200)).body;
    const r = await request(app).get(`/interno/productos/precios?ids=${primero.id},999999`).expect(200);
    expect(r.body).toEqual([{ id: primero.id, nombre: primero.nombre, precioVenta: expect.any(Number), activo: true }]);
    expect((await request(app).get('/interno/productos/precios?ids=').expect(200)).body).toEqual([]);
  });
});
