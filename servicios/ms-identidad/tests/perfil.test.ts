import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import amqp, { type ChannelModel } from 'amqplib';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { cerrarEventos, conectarEventos, eventosListos, INTERCAMBIO, type Evento } from '../src/config/eventos.js';
import type { DatosPermisosCambiados } from '../src/services/aviso.service.js';
import { obtenerToken, registrarCliente } from './ayudantes.js';

/**
 * HU-07 · Perfil propio: «se pide la contraseña actual para cambiarla; no se
 * puede cambiar el rol ni el estado de la cuenta». Y, desde el Sprint 7,
 * cambiarla cierra la sesión en los demás dispositivos.
 */
const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });
let conexion: ChannelModel;
const avisos: Evento<DatosPermisosCambiados>[] = [];

beforeAll(async () => {
  await conectarEventos({ servicio: 'ms-identidad' });
  await eventosListos();
  conexion = await amqp.connect(process.env.RABBITMQ_URL!);
  const canal = await conexion.createChannel();
  await canal.assertExchange(INTERCAMBIO, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
  await canal.bindQueue(queue, INTERCAMBIO, 'PermisosCambiados');
  await canal.consume(queue, (m) => m && avisos.push(JSON.parse(m.content.toString())), { noAck: true });
});

afterAll(async () => {
  await conexion.close();
  await cerrarEventos();
});

describe('HU-07 · Perfil propio', () => {
  it('el titular corrige sus datos, pero no su rol ni el estado de su cuenta', async () => {
    const { token } = await registrarCliente();
    const r = await request(app)
      .put('/api/perfil')
      .set(cabecera(token))
      .send({ nombre: 'Camila', telefono: '70012345', rol: 'Administrador', activo: false, idRol: 1 })
      .expect(200);
    expect(r.body).toMatchObject({ nombre: 'Camila', telefono: '70012345', rol: 'Cliente' });
    // Sigue pudiendo entrar: el estado de la cuenta no se tocó.
    await request(app).get('/api/perfil').set(cabecera(token)).expect(200);
  });

  it('cambiar la contraseña pide la actual', async () => {
    const { token } = await registrarCliente();
    const r = await request(app)
      .put('/api/perfil/contrasena')
      .set(cabecera(token))
      .send({ contrasenaActual: 'NoEsLaMia1!', contrasenaNueva: 'OtraClave2026!' })
      .expect(401);
    expect(r.body.error).toMatch(/contraseña actual no es correcta/);
    await request(app).put('/api/perfil/contrasena').set(cabecera(token)).send({ contrasenaNueva: 'OtraClave2026!' }).expect(400);
  });

  it('la nueva vale para entrar y la anterior ya no', async () => {
    const { token, nombreUsuario } = await registrarCliente();
    await request(app)
      .put('/api/perfil/contrasena')
      .set(cabecera(token))
      .send({ contrasenaActual: 'Cliente1234!', contrasenaNueva: 'OtraClave2026!' })
      .expect(200);
    await request(app).post('/api/auth/login').send({ nombreUsuario, contrasena: 'Cliente1234!' }).expect(401);
    await obtenerToken(nombreUsuario, 'OtraClave2026!');
  });

  it('cierra la sesión en los otros dispositivos y este sigue con un token nuevo', async () => {
    const { token, nombreUsuario } = await registrarCliente();
    const idUsuario = (jwt.decode(token) as { idUsuario: number }).idUsuario;
    await new Promise((r) => setTimeout(r, 1100)); // el token nuevo, de un segundo posterior
    const r = await request(app)
      .put('/api/perfil/contrasena')
      .set(cabecera(token))
      .send({ contrasenaActual: 'Cliente1234!', contrasenaNueva: 'OtraClave2026!' })
      .expect(200);
    expect(r.body.usuario).toMatchObject({ id: idUsuario, nombreUsuario });
    const nuevo = jwt.decode(r.body.token) as { iat: number };

    // Los demás servicios rechazan desde ahora los tokens anteriores (HU-05).
    for (let i = 0; i < 50 && !avisos.some((e) => 'idUsuario' in e.datos && e.datos.idUsuario === idUsuario); i++) {
      await new Promise((ok) => setTimeout(ok, 100));
    }
    const aviso = avisos.find((e) => 'idUsuario' in e.datos && e.datos.idUsuario === idUsuario)!;
    const desde = new Date(aviso.datos.desde).getTime() / 1000;
    expect((jwt.decode(token) as { iat: number }).iat).toBeLessThan(desde);
    expect(nuevo.iat).toBeGreaterThanOrEqual(desde);
  });
});
