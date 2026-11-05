import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import amqp from 'amqplib';
import {
  cerrarEventos,
  colaDe,
  colaFallidosDe,
  conectarEventos,
  eventosListos,
  INTERCAMBIO,
  type Evento,
} from '../src/config/eventos.js';
import { buzonLocal } from '../src/config/correo.js';
import { registroDeEventos } from '../src/models/evento.model.js';
import { registrarSuscripciones } from '../src/suscripciones.js';
import { bd, mongo } from '../src/config/mongo.js';

/**
 * HU-06 · T7.2 — ms-reportes manda por correo el código que publica ms-identidad.
 *
 * Sin SMTP (como en las pruebas), el correo queda en `buzonLocal`. Las pruebas
 * consumen con un nombre de servicio propio, para no competir con el
 * ms-reportes que corre en docker compose por los mismos eventos.
 */
const SERVICIO = `prueba-correo-${Math.random().toString(36).slice(2, 8)}`;
const URL = process.env.RABBITMQ_URL!;

function evento(datos: Record<string, unknown>, id = crypto.randomUUID()): Evento {
  return { id, tipo: 'CodigoRecuperacionGenerado', origen: 'ms-identidad', fecha: new Date().toISOString(), datos };
}

async function publicarCrudo(e: Evento) {
  const conexion = await amqp.connect(URL);
  const canal = await conexion.createConfirmChannel();
  canal.publish(INTERCAMBIO, e.tipo, Buffer.from(JSON.stringify(e)), { persistent: true });
  await canal.waitForConfirms();
  await conexion.close();
}

async function hasta<T>(condicion: () => T | undefined | false | Promise<T | undefined | false>, ms = 8000) {
  const limite = Date.now() + ms;
  for (;;) {
    const valor = await condicion();
    if (valor) return valor;
    if (Date.now() > limite) throw new Error('no se cumplió a tiempo');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const correosPara = (email: string) => buzonLocal.filter((c) => c.para === email);

beforeAll(async () => {
  await (await bd()).dropDatabase();
  registrarSuscripciones();
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

describe('HU-06 · El código llega por correo (T7.2)', () => {
  it('convierte CodigoRecuperacionGenerado en un correo con el código y su vencimiento', async () => {
    await publicarCrudo(evento({ idUsuario: 7, email: 'ana@correo.bo', nombre: 'Ana', codigo: '048213', minutos: 15 }));
    const [correo] = await hasta(() => correosPara('ana@correo.bo').length > 0 && correosPara('ana@correo.bo'));
    expect(correo.asunto).toBe('Su código para recuperar la contraseña');
    expect(correo.texto).toContain('Hola, Ana:');
    expect(correo.texto).toContain('048 213');
    expect(correo.texto).toContain('Vence en 15 minutos y sirve una sola vez.');
    expect(correo.html).toContain('048 213');
  });

  it('un evento repetido no manda dos correos', async () => {
    const repetido = evento({ idUsuario: 8, email: 'luis@correo.bo', nombre: 'Luis', codigo: '555111', minutos: 15 });
    await publicarCrudo(repetido);
    await publicarCrudo(repetido);
    // Uno distinto detrás: cuando llega, los dos anteriores ya se atendieron (de a uno, en orden).
    await publicarCrudo(evento({ idUsuario: 9, email: 'marca@correo.bo', nombre: 'Marca', codigo: '000001', minutos: 15 }));
    await hasta(() => correosPara('marca@correo.bo').length > 0);
    expect(correosPara('luis@correo.bo')).toHaveLength(1);
  });

  it('un evento mal formado no manda correo y queda en la cola de fallidos', async () => {
    const roto = evento({ idUsuario: 10, email: 'no-es-un-correo', nombre: 'X', codigo: '12', minutos: 15 });
    await publicarCrudo(roto);
    const conexion = await amqp.connect(URL);
    const canal = await conexion.createChannel();
    const mensaje = await hasta(() => canal.get(colaFallidosDe(SERVICIO), { noAck: true }));
    await conexion.close();
    expect(JSON.parse(mensaje.content.toString()).id).toBe(roto.id);
    expect(correosPara('no-es-un-correo')).toHaveLength(0);
  });

  it('el nombre se escapa en el HTML del correo', async () => {
    await publicarCrudo(
      evento({ idUsuario: 11, email: 'raro@correo.bo', nombre: '<b>Pepe</b>', codigo: '123456', minutos: 15 }),
    );
    const [correo] = await hasta(() => correosPara('raro@correo.bo').length > 0 && correosPara('raro@correo.bo'));
    expect(correo.html).toContain('&lt;b&gt;Pepe&lt;/b&gt;');
    expect(correo.html).not.toContain('<b>Pepe</b>');
  });
});
