import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import type { RedisReply } from 'rate-limit-redis';
import { AlmacenConRespaldo, type EnviarARedis } from '../src/middlewares/almacen-limites.js';

/**
 * T7.3 · Los contadores de intentos por IP viven en Redis: no se reinician al
 * reiniciar el servicio, y si Redis no responde el límite sigue en pie.
 *
 * Contra el Redis de docker compose, en la base 15 (reservada para pruebas),
 * que se vacía al empezar.
 */
const cliente = createClient({ url: 'redis://:nutriexpress@127.0.0.1:6380/15' });
const enviar: EnviarARedis = (...orden) => cliente.sendCommand(orden) as Promise<RedisReply>;

/** Un servicio mínimo con un límite de 2 pedidos por minuto, como los de ms-identidad. */
function servicio(almacen: AlmacenConRespaldo) {
  const app = express();
  app.use(rateLimit({ store: almacen, windowMs: 60_000, limit: 2, standardHeaders: true, legacyHeaders: false }));
  app.get('/', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

beforeAll(async () => {
  await cliente.connect();
  await cliente.flushDb();
});
afterAll(async () => {
  await cliente.close();
});

describe('T7.3 · Límites por IP en Redis (RNF-SEG-01, RNF-DIS-01)', () => {
  it('el contador queda en Redis, con el prefijo del límite', async () => {
    const app = servicio(new AlmacenConRespaldo('identidad:limite:prueba-a:', enviar));
    await request(app).get('/').expect(200);
    const claves = await cliente.keys('identidad:limite:prueba-a:*');
    expect(claves).toHaveLength(1);
    expect(await cliente.get(claves[0])).toBe('1');
  });

  it('reiniciar el servicio no devuelve el cupo', async () => {
    const prefijo = 'identidad:limite:prueba-b:';
    const antes = servicio(new AlmacenConRespaldo(prefijo, enviar));
    await request(antes).get('/').expect(200);
    await request(antes).get('/').expect(200);
    await request(antes).get('/').expect(429);

    // Otro proceso, con su propia memoria, como después de un reinicio.
    const despues = servicio(new AlmacenConRespaldo(prefijo, enviar));
    await request(despues).get('/').expect(429);
  });

  it('si Redis no responde, cuenta en memoria y el límite sigue en pie', async () => {
    const caido: EnviarARedis = async () => {
      throw new Error('Redis apagado');
    };
    const app = servicio(new AlmacenConRespaldo('identidad:limite:prueba-c:', caido));
    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    await request(app).get('/').expect(429);
  });

  it('sin Redis configurado (como en las demás pruebas), cuenta en memoria', async () => {
    const app = servicio(new AlmacenConRespaldo('identidad:limite:prueba-d:', undefined));
    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    await request(app).get('/').expect(429);
    expect(await cliente.keys('identidad:limite:prueba-d:*')).toHaveLength(0);
  });
});
