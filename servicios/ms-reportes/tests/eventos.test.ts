import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import amqp from 'amqplib';
import {
  cerrarEventos,
  colaDe,
  colaFallidosDe,
  conectarEventos,
  eventosListos,
  INTERCAMBIO,
  publicar,
  suscribir,
  type Evento,
} from '../src/config/eventos.js';
import { registroDeEventos } from '../src/models/evento.model.js';
import { bd, mongo } from '../src/config/mongo.js';

/**
 * HT-03 Eventos en RabbitMQ: «un evento publicado por un servicio llega a sus
 * consumidores; un evento repetido no se procesa dos veces».
 *
 * Contra el RabbitMQ y el MongoDB de docker compose. Cada corrida usa un
 * servicio con nombre propio, así sus colas no se mezclan con las reales, y las
 * borra al terminar.
 */
const SERVICIO = `prueba-${Math.random().toString(36).slice(2, 8)}`;
const URL = process.env.RABBITMQ_URL!;

const recibidos: Evento<{ n: number }>[] = [];
let intentosDelQueFalla = 0;

/** Espera a que la condición (síncrona o no) dé algo verdadero, y lo devuelve. */
async function hasta<T>(condicion: () => T | undefined | false | Promise<T | undefined | false>, ms = 8000): Promise<T> {
  const limite = Date.now() + ms;
  for (;;) {
    const valor = await condicion();
    if (valor) return valor;
    if (Date.now() > limite) throw new Error('no se cumplió a tiempo');
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Publica directo en el exchange, como lo haría un servicio que repite un envío. */
async function publicarCrudo(evento: Evento) {
  const conexion = await amqp.connect(URL);
  const canal = await conexion.createConfirmChannel();
  canal.publish(INTERCAMBIO, evento.tipo, Buffer.from(JSON.stringify(evento)), { persistent: true });
  await canal.waitForConfirms();
  await conexion.close();
}

beforeAll(async () => {
  await (await bd()).dropDatabase();
  suscribir('PruebaRecibida', async (e) => {
    recibidos.push(e);
  });
  suscribir('PruebaQueFalla', async () => {
    intentosDelQueFalla++;
    throw new Error('falla a propósito');
  });
  await conectarEventos({ servicio: SERVICIO, registro: registroDeEventos });
  await eventosListos();
});

afterAll(async () => {
  await cerrarEventos();
  const conexion = await amqp.connect(URL);
  const canal = await conexion.createChannel();
  await canal.deleteQueue(colaDe(SERVICIO));
  await canal.deleteQueue(colaFallidosDe(SERVICIO));
  await conexion.close();
  await mongo.close();
});

describe('HT-03 Eventos en RabbitMQ (RNF-ARQ-05, RNF-DIS-03)', () => {
  it('un evento publicado llega a su consumidor, con su identificador y su origen', async () => {
    const publicado = await publicar('PruebaRecibida', { n: 1 });
    const llegado = await hasta(() => recibidos.find((e) => e.id === publicado.id));
    expect(llegado).toMatchObject({ tipo: 'PruebaRecibida', origen: SERVICIO, datos: { n: 1 } });
    expect(new Date(llegado.fecha).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('un evento repetido no se procesa dos veces', async () => {
    const repetido: Evento = {
      id: crypto.randomUUID(),
      tipo: 'PruebaRecibida',
      origen: 'otro-servicio',
      fecha: new Date().toISOString(),
      datos: { n: 2 },
    };
    await publicarCrudo(repetido);
    await publicarCrudo(repetido);
    // Se atienden de a uno y en orden: cuando llega el tercero, el repetido ya pasó.
    const ultimo = await publicar('PruebaRecibida', { n: 3 });
    await hasta(() => recibidos.some((e) => e.id === ultimo.id));
    expect(recibidos.filter((e) => e.id === repetido.id)).toHaveLength(1);
  });

  it('el registro de MongoDB recuerda los eventos procesados', async () => {
    const [primero] = recibidos;
    expect(await registroDeEventos.yaProcesado(primero.id)).toBe(true);
    expect(await registroDeEventos.yaProcesado(crypto.randomUUID())).toBe(false);
    // Anotarlo otra vez no es un error.
    await expect(registroDeEventos.marcarProcesado(primero)).resolves.toBeUndefined();
  });

  it('un evento que falla se reintenta una vez y después va a la cola de fallidos', async () => {
    const fallido = await publicar('PruebaQueFalla', { n: 4 });
    await hasta(() => intentosDelQueFalla >= 2);

    const conexion = await amqp.connect(URL);
    const canal = await conexion.createChannel();
    const mensaje = await hasta(() => canal.get(colaFallidosDe(SERVICIO), { noAck: true }));
    await conexion.close();

    const enFallidos = JSON.parse(mensaje.content.toString()) as Evento;
    expect(enFallidos.id).toBe(fallido.id);
    expect(intentosDelQueFalla).toBe(2);
    // Lo que falló no queda anotado como procesado.
    expect(await registroDeEventos.yaProcesado(fallido.id)).toBe(false);
  });
});
