import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { bd, mongo } from '../src/config/mongo.js';

beforeAll(async () => {
  await (await bd()).dropDatabase();
});
afterAll(async () => {
  await mongo.close();
});

describe('HU-31 Contador de visitas por página (RF-WEB-03)', () => {
  it('la primera visita a una página la cuenta desde hoy', async () => {
    const r = await request(app).post('/api/visitas').send({ ruta: '/portal' }).expect(201);
    expect(r.body).toMatchObject({ ruta: '/portal', total: 1 });
    expect(new Date(r.body.desde).toDateString()).toBe(new Date().toDateString());
  });

  it('cada página lleva su propio total', async () => {
    await request(app).post('/api/visitas').send({ ruta: '/portal' }).expect(201);
    const otra = await request(app).post('/api/visitas').send({ ruta: '/login' }).expect(201);
    expect(otra.body.total).toBe(1);
    const portal = await request(app).get('/api/visitas').query({ ruta: '/portal' }).expect(200);
    expect(portal.body.total).toBe(2);
  });

  it('consultar no suma visitas', async () => {
    await request(app).get('/api/visitas').query({ ruta: '/login' });
    const r = await request(app).get('/api/visitas').query({ ruta: '/login' }).expect(200);
    expect(r.body.total).toBe(1);
  });

  it('visitas simultáneas no se pisan: el $inc de MongoDB es atómico', async () => {
    // Página nueva: las veinte compiten por crear el documento y ninguna falla.
    const respuestas = await Promise.all(
      Array.from({ length: 20 }, () => request(app).post('/api/visitas').send({ ruta: '/carrera' })),
    );
    expect(respuestas.map((x) => x.status)).toEqual(Array(20).fill(201));
    const r = await request(app).get('/api/visitas').query({ ruta: '/carrera' }).expect(200);
    expect(r.body.total).toBe(20);
  });

  it('una página nunca visitada tiene cero', async () => {
    const r = await request(app).get('/api/visitas').query({ ruta: '/nunca' }).expect(200);
    expect(r.body).toMatchObject({ total: 0, desde: null });
  });

  it('rechaza una ruta que no empieza con "/"', async () => {
    const r = await request(app).post('/api/visitas').send({ ruta: 'portal' }).expect(400);
    expect(r.body.error).toContain('ruta');
  });
});
