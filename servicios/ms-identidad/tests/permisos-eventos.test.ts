import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import amqp, { type ChannelModel } from 'amqplib';
import { app } from '../src/app.js';
import { cerrarEventos, conectarEventos, eventosListos, INTERCAMBIO, type Evento } from '../src/config/eventos.js';
import type { DatosPermisosCambiados } from '../src/services/aviso.service.js';
import { crearEmpleado, obtenerToken, sufijo } from './ayudantes.js';

/**
 * HU-05 · T6.1 — ms-identidad avisa por RabbitMQ cada vez que cambian los
 * permisos efectivos de alguien, para que los demás servicios dejen de aceptar
 * los tokens anteriores.
 */
let conexion: ChannelModel;
const avisos: Evento<DatosPermisosCambiados>[] = [];
const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** El aviso que cumpla la condición (espera hasta 5 s). */
async function avisoDonde(condicion: (d: DatosPermisosCambiados) => boolean) {
  for (let i = 0; i < 50; i++) {
    const a = avisos.find((e) => condicion(e.datos));
    if (a) return a;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('no llegó el aviso PermisosCambiados esperado');
}

const delUsuario = (id: number) => (d: DatosPermisosCambiados) => 'idUsuario' in d && d.idUsuario === id;

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

describe('HU-05 · ms-identidad publica PermisosCambiados (T6.1)', () => {
  it('al ajustar los permisos de un usuario, con la fecha redondeada al segundo', async () => {
    const admin = await obtenerToken();
    const empleado = await crearEmpleado('Cocinero');
    const disponibles = (await request(app).get(`/api/usuarios/${empleado.id}/permisos`).set(cabecera(admin)).expect(200))
      .body as { idRolPermiso: number }[];

    const antes = Date.now();
    await request(app)
      .put(`/api/usuarios/${empleado.id}/permisos`)
      .set(cabecera(admin))
      .send({ idsRolPermiso: disponibles.slice(0, 1).map((p) => p.idRolPermiso) })
      .expect(200);

    const aviso = await avisoDonde(delUsuario(empleado.id));
    expect(aviso.origen).toBe('ms-identidad');
    const desde = Date.parse(aviso.datos.desde);
    expect(desde % 1000).toBe(0);
    expect(desde).toBeGreaterThanOrEqual(Math.floor(antes / 1000) * 1000);
    expect(desde).toBeLessThanOrEqual(Date.now());
  });

  it('al cambiarle el rol a un usuario', async () => {
    const admin = await obtenerToken();
    const empleado = await crearEmpleado('Vendedor');
    const roles = (await request(app).get('/api/roles').set(cabecera(admin))).body as { id: number; nombre: string }[];
    const administrador = roles.find((r) => r.nombre === 'Administrador')!;

    await request(app).put(`/api/usuarios/${empleado.id}`).set(cabecera(admin)).send({ idRol: administrador.id }).expect(200);
    await avisoDonde(delUsuario(empleado.id));
  });

  it('al editar los permisos de un rol, para todos los que lo tienen', async () => {
    const admin = await obtenerToken();
    const creado = await request(app)
      .post('/api/roles')
      .set(cabecera(admin))
      .send({ nombre: `Rol ${sufijo()}`, idsPermiso: [] })
      .expect(201);

    await request(app)
      .put(`/api/roles/${creado.body.id}`)
      .set(cabecera(admin))
      .send({ nombre: creado.body.nombre, idsPermiso: [] })
      .expect(200);
    await avisoDonde((d) => 'idRol' in d && d.idRol === creado.body.id);
  });

  it('al dar de baja una cuenta', async () => {
    const admin = await obtenerToken();
    const empleado = await crearEmpleado('Repartidor');
    await request(app).delete(`/api/usuarios/${empleado.id}`).set(cabecera(admin)).expect(204);
    await avisoDonde(delUsuario(empleado.id));
  });
});
