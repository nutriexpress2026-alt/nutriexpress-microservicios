import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import amqp from 'amqplib';
import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
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
 * HU-05 · ms-inventario también respeta los cambios de permisos en la petición
 * siguiente (T6.1). El detalle del mecanismo se prueba en ms-catalogo; aquí, que
 * el servicio lo tiene conectado: el aviso llega y el token viejo deja de servir.
 */
const SERVICIO = `prueba-inventario-${Math.random().toString(36).slice(2, 8)}`;
const URL = process.env.RABBITMQ_URL!;

const almacenero = (emitidoHace = 0) =>
  cabecera({ idUsuario: 805, rol: 'Empleado', cargo: 'Almacenero', permisos: ['STOCK_CONSULTAR'], emitidoHace });

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
  it('tras PermisosCambiados, el token viejo del almacenero deja de servir y el nuevo sí', async () => {
    await request(app).get('/api/insumos').set(almacenero(30)).expect(200);

    const evento: Evento = {
      id: crypto.randomUUID(),
      tipo: 'PermisosCambiados',
      origen: 'ms-identidad',
      fecha: new Date().toISOString(),
      datos: { idUsuario: 805, desde: new Date(Math.floor(Date.now() / 1000) * 1000).toISOString() },
    };
    const conexion = await amqp.connect(URL);
    const canal = await conexion.createConfirmChannel();
    canal.publish(INTERCAMBIO, evento.tipo, Buffer.from(JSON.stringify(evento)), { persistent: true });
    await canal.waitForConfirms();
    await conexion.close();
    for (let i = 0; i < 100 && !(await registroDeEventos.yaProcesado(evento.id)); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const rechazo = await request(app).get('/api/insumos').set(almacenero(30)).expect(401);
    expect(rechazo.body.error).toContain('Sus permisos cambiaron');
    await request(app).get('/api/insumos').set(almacenero()).expect(200);
  });
});
