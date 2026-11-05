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
import { registrarSuscripciones } from '../src/suscripciones.js';
import { registroDeEventos } from '../src/models/evento.model.js';
import { prisma } from '../src/config/prisma.js';

/**
 * HT-03 · T2.2 — la réplica de productos de ms-inventario se actualiza con el
 * evento ProductoGuardado de ms-catalogo, por el RabbitMQ de docker compose.
 */
const SERVICIO = `prueba-replica-${Math.random().toString(36).slice(2, 8)}`;
const URL = process.env.RABBITMQ_URL!;

async function publicarProducto(datos: { id: number; nombre: string; tipoConservacion: string; activo: boolean }) {
  const evento: Evento = {
    id: crypto.randomUUID(),
    tipo: 'ProductoGuardado',
    origen: 'ms-catalogo',
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
}

beforeAll(async () => {
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
  await prisma.$disconnect();
});

describe('HT-03 · La réplica de productos se actualiza por eventos (T2.2)', () => {
  it('un producto nuevo de ms-catalogo aparece en la réplica', async () => {
    await publicarProducto({ id: 951, nombre: 'Wrap de pollo', tipoConservacion: 'Refrigerado', activo: true });
    const replica = await prisma.producto.findUnique({ where: { id_producto: 951 } });
    expect(replica).toMatchObject({ nombre: 'Wrap de pollo', tipo_conservacion: 'Refrigerado', activo: true });
  });

  it('un cambio o una baja se reflejan en la réplica existente', async () => {
    await publicarProducto({ id: 951, nombre: 'Wrap de pollo grillado', tipoConservacion: 'Refrigerado', activo: false });
    const replica = await prisma.producto.findUnique({ where: { id_producto: 951 } });
    expect(replica).toMatchObject({ nombre: 'Wrap de pollo grillado', activo: false });
  });
});
