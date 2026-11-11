import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'node:http';
import { app } from '../src/app.js';
import { crearEmpleado, obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

/** HU-20 · Gestionar clientes, y las rutas internas que usan ms-pedidos y ms-ventas (HU-18, HU-23). */
const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

// ms-pedidos y ms-ventas falsos: dicen cuántos pedidos y ventas tiene cada cliente.
const conteos: Record<string, Record<string, number>> = { pedidos: {}, ventas: {} };
const falso = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const servicio = url.pathname.split('/')[1];
  const ids = (url.searchParams.get('clientes') ?? '').split(',');
  const respuesta = Object.fromEntries(ids.filter((id) => conteos[servicio]?.[id]).map((id) => [id, conteos[servicio][id]]));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(respuesta));
});

let tokenVendedor: string;
let idCliente: number;
let tokenCliente: string;

beforeAll(async () => {
  await new Promise<void>((ok) => falso.listen(4995, '127.0.0.1', ok));
  tokenVendedor = (await crearEmpleado('Vendedor')).token;
  const cliente = await registrarCliente();
  tokenCliente = cliente.token;
  idCliente = (await request(app).get('/api/perfil').set(cabecera(tokenCliente))).body.id;
});

afterAll(() => new Promise((ok) => falso.close(ok)));

describe('HU-20 · Gestionar clientes', () => {
  it('el vendedor busca por nombre o correo, sin importar tildes ni mayúsculas', async () => {
    const apellido = `Ñúñez${sufijo()}`;
    await request(app).put(`/api/clientes/${idCliente}`).set(cabecera(tokenVendedor)).send({ apellido }).expect(200);
    const r = await request(app).get(`/api/clientes?termino=${encodeURIComponent(apellido.replace('ú', 'u').toLowerCase())}`).set(cabecera(tokenVendedor)).expect(200);
    expect(r.body.datos.map((c: { id: number }) => c.id)).toEqual([idCliente]);
    expect(r.body.datos[0]).toMatchObject({ apellido, nombreCompleto: `Cliente ${apellido}`, activo: true });
  });

  it('la ficha cuenta sus pedidos y ventas, que piden a ms-pedidos y ms-ventas', async () => {
    conteos.pedidos[idCliente] = 3;
    conteos.ventas[idCliente] = 1;
    const r = await request(app).get(`/api/clientes/${idCliente}`).set(cabecera(tokenVendedor)).expect(200);
    expect(r.body).toMatchObject({ id: idCliente, cantidadPedidos: 3, cantidadVentas: 1 });
  });

  it('corrige los datos y las preferencias del cliente', async () => {
    const r = await request(app)
      .put(`/api/clientes/${idCliente}`)
      .set(cabecera(tokenVendedor))
      .send({ telefono: '70011223', preferenciaAlimentaria: 'Vegetariana', restriccionDietetica: 'Sin gluten' })
      .expect(200);
    expect(r.body).toMatchObject({ telefono: '70011223', preferenciaAlimentaria: 'Vegetariana', restriccionDietetica: 'Sin gluten' });
  });

  it('no admite un correo que ya usa otra cuenta', async () => {
    const r = await request(app).put(`/api/clientes/${idCliente}`).set(cabecera(tokenVendedor)).send({ email: 'admin@nutriexpress.bo' }).expect(409);
    expect(r.body.error).toMatch(/correo electrónico ya está registrado/);
  });

  it('desactivar oculta la ficha de la lista, salvo que se pidan las inactivas', async () => {
    await request(app).put(`/api/clientes/${idCliente}`).set(cabecera(tokenVendedor)).send({ activo: false }).expect(200);
    const sin = await request(app).get('/api/clientes?pagina=1&tamano=100').set(cabecera(tokenVendedor)).expect(200);
    expect(sin.body.datos.some((c: { id: number }) => c.id === idCliente)).toBe(false);
    const con = await request(app).get(`/api/clientes/${idCliente}`).set(cabecera(tokenVendedor)).expect(200);
    expect(con.body.activo).toBe(false);
    await request(app).put(`/api/clientes/${idCliente}`).set(cabecera(tokenVendedor)).send({ activo: true }).expect(200);
  });

  it('un cliente no entra a la gestión de clientes', async () => {
    await request(app).get('/api/clientes').set(cabecera(tokenCliente)).expect(403);
  });

  it('un cliente que no existe responde 404', async () => {
    await request(app).get('/api/clientes/999999').set(cabecera(tokenVendedor)).expect(404);
  });
});

describe('Rutas internas de ms-identidad', () => {
  it('lista los repartidores activos (HU-23)', async () => {
    const repartidor = await crearEmpleado('Repartidor');
    const r = await request(app).get('/interno/repartidores').expect(200);
    expect(r.body).toContainEqual(expect.objectContaining({ id: repartidor.id, apellido: 'Repartidor' }));
    expect(r.body.every((x: { id: number }) => typeof x.id === 'number')).toBe(true);
  });

  it('da el cargo de un empleado para asignar un pedido', async () => {
    const vendedor = await crearEmpleado('Vendedor');
    const r = await request(app).get(`/interno/empleados/${vendedor.id}`).expect(200);
    expect(r.body).toMatchObject({ id: vendedor.id, cargo: 'Vendedor', activo: true });
    await request(app).get('/interno/empleados/999999').expect(404);
  });

  it('da el nombre de un cliente para una venta de mostrador (HU-18)', async () => {
    const r = await request(app).get(`/interno/clientes/${idCliente}`).expect(200);
    expect(r.body).toMatchObject({ id: idCliente, activo: true, nombreCompleto: expect.stringMatching(/^Cliente /), email: expect.stringMatching(/@correo\.bo$/) });
    await request(app).get('/interno/clientes/999999').expect(404);
  });

  it('no se alcanzan a través del gateway', async () => {
    await request(app).get('/interno/repartidores').set('X-Forwarded-For', '1.2.3.4').expect(404);
    // Y el token del administrador no cambia eso.
    const token = await obtenerToken();
    await request(app).get('/interno/repartidores').set(cabecera(token)).set('X-Forwarded-For', '1.2.3.4').expect(404);
  });
});
