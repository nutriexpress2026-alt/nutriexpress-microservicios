import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { cerrarEventos, conectarEventos, eventosListos, INTERCAMBIO, type Evento } from '../src/config/eventos.js';
import type { DatosCodigoRecuperacion } from '../src/services/recuperacion.service.js';
import { registrarCliente } from './ayudantes.js';

/**
 * HU-06 Recuperar contraseña: «el código vence a los 15 minutos y sirve una vez;
 * la respuesta es la misma exista o no la cuenta».
 *
 * El código se lee del evento `CodigoRecuperacionGenerado` que ms-identidad
 * publica en RabbitMQ: es lo mismo que recibe ms-reportes para mandar el correo.
 */
const MENSAJE = 'Si hay una cuenta con ese dato, le enviamos un código a su correo.';

let conexion: ChannelModel;
let canal: Channel;
const eventos: Evento<DatosCodigoRecuperacion>[] = [];

/** Cada prueba usa su propia «dirección IP», así los límites por IP de una no frenan a otra. */
let ip = 0;
const desde = () => `10.6.0.${++ip}`;

const pedir = (identificador: string, origen: string) =>
  request(app).post('/api/auth/recuperar').set('X-Forwarded-For', origen).send({ identificador });
const verificar = (identificador: string, codigo: string, origen: string) =>
  request(app).post('/api/auth/recuperar/verificar').set('X-Forwarded-For', origen).send({ identificador, codigo });
const restablecer = (identificador: string, codigo: string, contrasena: string, origen: string) =>
  request(app)
    .post('/api/auth/recuperar/restablecer')
    .set('X-Forwarded-For', origen)
    .send({ identificador, codigo, contrasena });
const entrar = (nombreUsuario: string, contrasena: string) =>
  request(app).post('/api/auth/login').send({ nombreUsuario, contrasena });

async function esperar(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** El `n`-ésimo evento que llegó para ese correo (espera hasta 5 s). */
async function eventoPara(email: string, n = 1) {
  for (let i = 0; i < 50; i++) {
    const deEse = eventos.filter((x) => x.datos.email === email);
    if (deEse.length >= n) return deEse[n - 1];
    await esperar(100);
  }
  throw new Error(`no llegó el evento ${n} para ${email}`);
}

/** Un cliente nuevo con su código ya pedido. */
async function clienteConCodigo() {
  const cliente = await registrarCliente();
  const email = `${cliente.nombreUsuario}@correo.bo`;
  await pedir(cliente.nombreUsuario, desde()).expect(200);
  const evento = await eventoPara(email);
  return { ...cliente, email, codigo: evento.datos.codigo, evento };
}

beforeAll(async () => {
  await conectarEventos({ servicio: 'ms-identidad' });
  await eventosListos();
  // Una cola de la prueba, que se borra sola al cerrar, atada al evento.
  conexion = await amqp.connect(process.env.RABBITMQ_URL!);
  canal = await conexion.createChannel();
  await canal.assertExchange(INTERCAMBIO, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
  await canal.bindQueue(queue, INTERCAMBIO, 'CodigoRecuperacionGenerado');
  await canal.consume(queue, (m) => m && eventos.push(JSON.parse(m.content.toString())), { noAck: true });
});

afterAll(async () => {
  await conexion.close();
  await cerrarEventos();
});

describe('HU-06 · Pedir el código', () => {
  it('la respuesta es la misma exista o no la cuenta, y solo la que existe recibe código', async () => {
    const antes = eventos.length;
    const inexistente = await pedir('nadie-con-este-nombre', desde()).expect(200);
    expect(inexistente.body).toEqual({ mensaje: MENSAJE });

    const { email, evento } = await clienteConCodigo();
    expect(evento.datos.email).toBe(email);
    await esperar(300);
    // Solo llegó el de la cuenta que existe.
    expect(eventos.slice(antes).map((e) => e.datos.email)).toEqual([email]);
  });

  it('manda seis dígitos que vencen a los 15 minutos, y guarda solo su huella', async () => {
    const { codigo, evento } = await clienteConCodigo();
    expect(codigo).toMatch(/^\d{6}$/);
    expect(evento.datos.minutos).toBe(15);
    const vence = new Date(evento.datos.venceEn).getTime() - Date.now();
    expect(vence).toBeGreaterThan(14 * 60_000);
    expect(vence).toBeLessThanOrEqual(15 * 60_000);

    const guardado = await prisma.recuperacion_contrasena.findFirst({
      where: { id_usuario: evento.datos.idUsuario },
    });
    expect(guardado!.codigo_hash).toHaveLength(64);
    expect(guardado!.codigo_hash).not.toContain(codigo);
  });

  it('también se pide con el correo, sin importar mayúsculas', async () => {
    const cliente = await registrarCliente();
    const email = `${cliente.nombreUsuario}@correo.bo`;
    await pedir(email.toUpperCase(), desde()).expect(200);
    expect((await eventoPara(email)).datos.codigo).toMatch(/^\d{6}$/);
  });

  it('no manda otro código antes de un minuto', async () => {
    const { nombreUsuario, email } = await clienteConCodigo();
    await pedir(nombreUsuario, desde()).expect(200);
    await esperar(500);
    expect(eventos.filter((e) => e.datos.email === email)).toHaveLength(1);
  });
});

describe('HU-06 · Usar el código', () => {
  it('un código equivocado dice los intentos que quedan; al quinto se agota', async () => {
    const { nombreUsuario, codigo } = await clienteConCodigo();
    const otro = codigo === '000000' ? '111111' : '000000';
    const origen = desde();
    for (const quedan of [4, 3, 2, 1]) {
      const r = await verificar(nombreUsuario, otro, origen).expect(400);
      expect(r.body.error).toBe(`El código no es correcto. Le quedan ${quedan} intento(s).`);
    }
    const quinto = await verificar(nombreUsuario, otro, desde()).expect(400);
    expect(quinto.body.error).toContain('ya no le quedan intentos');
    // Ni el correcto sirve ya.
    const correcto = await verificar(nombreUsuario, codigo, desde()).expect(400);
    expect(correcto.body.error).toContain('Agotó los intentos');
  });

  it('verificar confirma el código sin gastarlo', async () => {
    const { nombreUsuario, codigo } = await clienteConCodigo();
    const origen = desde();
    expect((await verificar(nombreUsuario, codigo, origen).expect(200)).body).toEqual({ valido: true });
    await verificar(nombreUsuario, codigo, origen).expect(200);
  });

  it('cambia la contraseña, desbloquea la cuenta y el código sirve una sola vez', async () => {
    const { nombreUsuario, codigo } = await clienteConCodigo();
    // Tres intentos fallidos bloquean la cuenta (CU-SEG-05).
    for (let i = 0; i < 3; i++) await entrar(nombreUsuario, 'Equivocada1!');
    expect((await entrar(nombreUsuario, 'Cliente1234!')).status).toBe(423);

    const origen = desde();
    const r = await restablecer(nombreUsuario, codigo, 'Recuperada2026!', origen).expect(200);
    expect(r.body.mensaje).toContain('Su contraseña fue cambiada');

    // Entra con la nueva (desbloqueada) y ya no con la vieja.
    await entrar(nombreUsuario, 'Recuperada2026!').expect(200);
    expect((await entrar(nombreUsuario, 'Cliente1234!')).status).toBe(401);
    // El mismo código no sirve dos veces.
    const otraVez = await restablecer(nombreUsuario, codigo, 'OtraMas2026!', origen).expect(400);
    expect(otraVez.body.error).toContain('Pida uno nuevo');
  });

  it('pedir un código nuevo deja sin efecto el anterior, incluso después de usar el nuevo', async () => {
    const { nombreUsuario, email, codigo: primero } = await clienteConCodigo();
    // Pasa el minuto de espera entre códigos.
    await prisma.recuperacion_contrasena.updateMany({
      where: { usuario: { nombre_usuario: nombreUsuario } },
      data: { creado_en: new Date(Date.now() - 2 * 60_000) },
    });
    await pedir(nombreUsuario, desde()).expect(200);
    const segundo = (await eventoPara(email, 2)).datos.codigo;

    const origen = desde();
    // (Si por azar salieron iguales —uno en un millón—, el primero sí valdría: no se prueba eso.)
    if (segundo !== primero) await verificar(nombreUsuario, primero, origen).expect(400);
    await restablecer(nombreUsuario, segundo, 'Recuperada2026!', origen).expect(200);
    await verificar(nombreUsuario, primero, origen).expect(400);
  });

  it('un código vencido no sirve', async () => {
    const { nombreUsuario, codigo } = await clienteConCodigo();
    await prisma.recuperacion_contrasena.updateMany({
      where: { usuario: { nombre_usuario: nombreUsuario } },
      data: { creado_en: new Date(Date.now() - 20 * 60_000), expira_en: new Date(Date.now() - 1000) },
    });
    const r = await verificar(nombreUsuario, codigo, desde()).expect(400);
    expect(r.body.error).toContain('venció');
  });

  it('la contraseña nueva cumple la misma política del alta (RF-SEG-03)', async () => {
    const { nombreUsuario, codigo } = await clienteConCodigo();
    const r = await restablecer(nombreUsuario, codigo, 'corta', desde()).expect(400);
    expect(r.body.error).toContain('contrasena');
  });
});
