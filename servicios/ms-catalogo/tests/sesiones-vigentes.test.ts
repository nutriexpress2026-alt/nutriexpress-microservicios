import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import amqp from 'amqplib';
import { cabecera, cerrarServidorDeClave, type DatosToken } from './sesion-de-prueba.js';
import { app } from '../src/app.js';
import {
  cerrarEventos,
  colaDe,
  colaFallidosDe,
  conectarEventos,
  eventosListos,
  INTERCAMBIO,
  suscribir,
  type Evento,
} from '../src/config/eventos.js';
import { permisosCambiados, usarAlmacenDeVigencias } from '../src/middlewares/sesiones-vigentes.js';
import { almacenDeVigencias } from '../src/models/sesion.model.js';
import { registroDeEventos } from '../src/models/evento.model.js';
import { prisma } from '../src/config/prisma.js';

/**
 * HU-05 · «El cambio rige en la siguiente petición» también en ms-catalogo (T6.1).
 *
 * ms-identidad publica `PermisosCambiados`; aquí llega por el RabbitMQ de docker
 * compose, a una cola con nombre propio de la corrida (no compite con el
 * ms-catalogo que corre en docker), y se anota en la base de pruebas.
 */
const SERVICIO = `prueba-catalogo-${Math.random().toString(36).slice(2, 8)}`;
const URL = process.env.RABBITMQ_URL!;
const PERMISOS = ['PRODUCTO_GESTIONAR'];

const productos = (d: Omit<DatosToken, 'permisos'>) =>
  request(app).get('/api/productos').set(cabecera({ ...d, permisos: PERMISOS }));

/** Ahora, redondeado al segundo, como lo manda ms-identidad. */
const ahora = () => new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();

/** Publica PermisosCambiados como lo haría ms-identidad, y espera a que se procese. */
async function avisar(datos: { idUsuario?: number; idRol?: number; desde: string }) {
  const evento: Evento = {
    id: crypto.randomUUID(),
    tipo: 'PermisosCambiados',
    origen: 'ms-identidad',
    fecha: new Date().toISOString(),
    datos,
  };
  const conexion = await amqp.connect(URL);
  const canal = await conexion.createConfirmChannel();
  canal.publish(INTERCAMBIO, evento.tipo, Buffer.from(JSON.stringify(evento)), { persistent: true });
  await canal.waitForConfirms();
  await conexion.close();
  for (let i = 0; i < 100 && !(await registroDeEventos.yaProcesado(evento.id)); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return evento;
}

beforeAll(async () => {
  await usarAlmacenDeVigencias(almacenDeVigencias);
  suscribir('PermisosCambiados', permisosCambiados);
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
  await prisma.$disconnect();
  await cerrarServidorDeClave();
});

describe('HU-05 · Los cambios de permisos rigen en la petición siguiente (T6.1)', () => {
  it('un token anterior a un cambio de permisos de su usuario ya no sirve; uno nuevo sí', async () => {
    const viejo = { idUsuario: 701, emitidoHace: 30 };
    await productos(viejo).expect(200);

    await avisar({ idUsuario: 701, desde: ahora() });

    const rechazo = await productos(viejo).expect(401);
    expect(rechazo.body.error).toBe('Sus permisos cambiaron: vuelva a iniciar sesión.');
    // Al volver a entrar recibe un token nuevo, que sí sirve.
    await productos({ idUsuario: 701 }).expect(200);
    // Los demás usuarios no se enteran.
    await productos({ idUsuario: 702, emitidoHace: 30 }).expect(200);
  });

  it('un cambio en los permisos de un rol corta las sesiones de todos los de ese rol', async () => {
    await avisar({ idRol: 44, desde: ahora() });
    await productos({ idUsuario: 711, idRol: 44, emitidoHace: 30 }).expect(401);
    await productos({ idUsuario: 712, idRol: 44, emitidoHace: 30 }).expect(401);
    await productos({ idUsuario: 713, idRol: 45, emitidoHace: 30 }).expect(200);
  });

  it('lo anotado queda en la base: sobrevive a un reinicio del servicio', async () => {
    const filas = await prisma.sesion_vigente.findMany({ where: { clave: { in: ['usuario:701', 'rol:44'] } } });
    expect(filas).toHaveLength(2);

    // Otra copia del módulo, con la memoria vacía, como después de un reinicio.
    vi.resetModules();
    const reiniciado = await import('../src/middlewares/sesiones-vigentes.js');
    await reiniciado.usarAlmacenDeVigencias(almacenDeVigencias);
    const sesionVieja = {
      idUsuario: 701,
      nombreUsuario: 'prueba',
      nombre: 'Ana',
      apellido: 'Prueba',
      idRol: 1,
      rol: 'Empleado',
      cargo: 'Cocinero',
      permisos: PERMISOS,
      iat: Math.floor(Date.now() / 1000) - 30,
    };
    await expect(reiniciado.exigirSesionVigente(sesionVieja)).rejects.toThrow('Sus permisos cambiaron');
  });

  it('un aviso atrasado no devuelve la validez a los tokens viejos', async () => {
    const antes = await prisma.sesion_vigente.findUnique({ where: { clave: 'usuario:701' } });
    await avisar({ idUsuario: 701, desde: new Date(Date.now() - 3600_000).toISOString() });
    const despues = await prisma.sesion_vigente.findUnique({ where: { clave: 'usuario:701' } });
    expect(despues!.desde).toEqual(antes!.desde);
    await productos({ idUsuario: 701, emitidoHace: 30 }).expect(401);
  });

  it('cada aviso queda anotado una sola vez entre los eventos procesados', async () => {
    const evento = await avisar({ idUsuario: 799, desde: ahora() });
    expect(await prisma.evento_procesado.count({ where: { id_evento: evento.id } })).toBe(1);
  });
});
