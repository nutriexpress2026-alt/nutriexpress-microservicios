import { cabecera, cerrarServidorDeClave } from './sesion-de-prueba.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { clientes, cerrarServiciosFalsos, control, listas } from './servicios-falsos.js';
import { app } from '../src/app.js';
import { bd, mongo } from '../src/config/mongo.js';
import { buzonLocal } from '../src/config/correo.js';
import type { Evento } from '../src/config/eventos.js';
import { pedidoEstadoCambiado, sincronizar, ventaRegistrada } from '../src/services/proyeccion.service.js';
import { enviarPendientes } from '../src/services/aviso.service.js';
import * as bandeja from '../src/models/bandeja.model.js';

/** HU-28 reporte de ventas, HU-29 reporte de pedidos y HU-32 avisos por correo. */
const admin = cabecera({ idUsuario: 1, nombre: 'Ana', apellido: 'Admin', rol: 'Administrador', cargo: 'Administrador', permisos: ['VENTA_LEER', 'PEDIDO_LEER'] });
const cocinero = cabecera({ idUsuario: 4, rol: 'Empleado', cargo: 'Cocinero', permisos: ['PEDIDO_GESTIONAR'] });
const cliente = cabecera({ idUsuario: 60, rol: 'Cliente', cargo: null, permisos: ['PEDIDO_LEER', 'PEDIDO_GESTIONAR'] });

const HOY = '2026-11-20';
const enHora = (h: number, dia = HOY) => new Date(`${dia}T${String(h).padStart(2, '0')}:00:00-04:00`).toISOString();
let segundo = 0;
/** Cada foto, un poco más nueva que la anterior (como en la vida real). */
const ahora = () => new Date(Date.UTC(2026, 10, 20, 20, 0, ++segundo)).toISOString();

const evento = (tipo: string, datos: object): Evento => ({ id: crypto.randomUUID(), tipo, origen: 'prueba', fecha: new Date().toISOString(), datos });

function venta(id: number, o: Partial<{ estado: string; vendedor: number; metodo: string; items: object[]; hora: number; actualizadoEn: string }> = {}) {
  const items = o.items ?? [{ idProducto: 1, nombre: 'Ensalada Cesar', cantidad: 2, precioUnitario: 35, costoUnitario: 20 }];
  return {
    idVenta: id,
    fecha: enHora(o.hora ?? 12),
    estado: o.estado ?? 'Pagado',
    tipoVenta: 'Llevar',
    metodoPago: o.metodo ?? 'Efectivo',
    total: (items as { cantidad: number; precioUnitario: number }[]).reduce((t, l) => t + l.cantidad * l.precioUnitario, 0),
    idCliente: null,
    cliente: null,
    vendedor: o.vendedor === 9 ? { id: 9, nombre: 'Vicente Ventas' } : { id: 3, nombre: 'Valeria Ventas' },
    items,
    actualizadoEn: o.actualizadoEn ?? ahora(),
  };
}

function pedido(id: number, o: Partial<{ estado: string; estadoPago: string; metodo: string; repartidor: { id: number; nombre: string } | null; entrega: string | null; motivo: string | null }> = {}) {
  return {
    idPedido: id,
    idUsuario: 60,
    cliente: 'Camila Cliente',
    fechaPedido: enHora(10),
    estado: o.estado ?? 'Recibido',
    estadoPago: o.estadoPago ?? 'Pendiente',
    motivo: o.motivo ?? null,
    metodoPago: o.metodo ?? 'Efectivo',
    total: 50,
    referenciaPago: null,
    repartidor: o.repartidor ?? null,
    fechaEntrega: o.entrega ?? null,
    direccion: 'Avenida Banzer 1200',
    items: [
      { idProducto: 1, nombre: 'Ensalada Cesar', cantidad: 1, precioUnitario: 35, costoUnitario: o.estado === 'Entregado' ? 20 : null },
      { idProducto: 2, nombre: 'Jugo verde', cantidad: 1, precioUnitario: 15, costoUnitario: o.estado === 'Entregado' ? 6 : null },
    ],
    fecha: ahora(),
    actualizadoEn: ahora(),
  };
}

const RODRIGO = { id: 7, nombre: 'Rodrigo Reparto' };
const avisosDe = async (idPedido: number) => (await bandeja.todos()).filter((a) => a.pedido.idPedido === idPedido);

beforeAll(async () => {
  const base = await bd();
  for (const c of ['ventas', 'pedidos', 'bandeja_correos']) await base.collection(c).deleteMany({});
});

afterAll(async () => {
  await mongo.close();
  await cerrarServiciosFalsos();
  await cerrarServidorDeClave();
});

describe('HU-28 · Reporte de ventas', () => {
  beforeAll(async () => {
    await ventaRegistrada(evento('VentaRegistrada', venta(1)));
    await ventaRegistrada(evento('VentaRegistrada', venta(2, { vendedor: 9, metodo: 'QR', items: [{ idProducto: 2, nombre: 'Jugo verde', cantidad: 1, precioUnitario: 15, costoUnitario: 6 }] })));
    // Una anulada y una con QR todavía sin acreditar: ninguna suma.
    await ventaRegistrada(evento('VentaRegistrada', venta(3, { estado: 'Anulado' })));
    await ventaRegistrada(evento('VentaRegistrada', venta(4, { estado: 'Pendiente', metodo: 'QR' })));
    // Otro día: fuera del rango.
    await ventaRegistrada(evento('VentaRegistrada', { ...venta(5), fecha: enHora(12, '2026-11-25') }));
  });

  it('las anuladas no suman; la ganancia sale del costo de lo vendido', async () => {
    const r = await request(app).get(`/api/reportes/ventas?desde=${HOY}&hasta=${HOY}`).set(admin).expect(200);
    expect(r.body.resumen).toMatchObject({ cantidadVentas: 2, unidades: 3, total: 85, ticketPromedio: 42.5, costo: 46, ganancia: 39 });
    expect(r.body.anuladas).toEqual({ cantidad: 1, total: 70 });
    expect(r.body.porMetodoPago).toEqual([
      { metodo: 'Efectivo', cantidadVentas: 1, total: 70 },
      { metodo: 'QR', cantidadVentas: 1, total: 15 },
    ]);
    expect(r.body.porVendedor.map((v: { vendedor: string }) => v.vendedor)).toEqual(['Valeria Ventas', 'Vicente Ventas']);
  });

  it('se filtra por vendedor y por producto', async () => {
    const porVendedor = await request(app).get(`/api/reportes/ventas?desde=${HOY}&hasta=${HOY}&idVendedor=9`).set(admin).expect(200);
    expect(porVendedor.body).toMatchObject({ vendedor: 'Vicente Ventas', resumen: { cantidadVentas: 1, total: 15 } });
    const porProducto = await request(app).get(`/api/reportes/ventas?desde=${HOY}&hasta=${HOY}&idProducto=2`).set(admin).expect(200);
    expect(porProducto.body).toMatchObject({ producto: 'Jugo verde', resumen: { total: 15 } });
    const vendedores = await request(app).get('/api/reportes/ventas/vendedores').set(admin).expect(200);
    expect(vendedores.body).toEqual([{ id: 3, nombre: 'Valeria Ventas' }, { id: 9, nombre: 'Vicente Ventas' }]);
  });

  it('una foto atrasada no pisa a una más nueva', async () => {
    const vieja = venta(3, { estado: 'Pagado', actualizadoEn: new Date(Date.UTC(2026, 10, 1)).toISOString() });
    await ventaRegistrada(evento('VentaRegistrada', vieja));
    const r = await request(app).get(`/api/reportes/ventas?desde=${HOY}&hasta=${HOY}`).set(admin).expect(200);
    expect(r.body.anuladas.cantidad).toBe(1);
  });

  it('se descarga en PDF', async () => {
    const r = await request(app).get(`/api/reportes/ventas.pdf?desde=${HOY}&hasta=${HOY}`).set(admin).buffer().expect(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('el PDF llega a todos los correos indicados', async () => {
    buzonLocal.length = 0;
    const r = await request(app)
      .post('/api/reportes/ventas/enviar')
      .set(admin)
      .send({ desde: HOY, hasta: HOY, para: 'gerencia@tecnologia.web, ventas@tecnologia.web' })
      .expect(200);
    expect(r.body).toMatchObject({ enviado: true, para: ['gerencia@tecnologia.web', 'ventas@tecnologia.web'] });
    expect(buzonLocal.at(-1)).toMatchObject({ para: ['gerencia@tecnologia.web', 'ventas@tecnologia.web'], asunto: 'Reporte de ventas · NutriExpress' });
    expect(buzonLocal.at(-1)!.adjuntos![0]).toMatchObject({ nombre: `ventas-${HOY}-a-${HOY}.pdf`, tipo: 'application/pdf' });
    await request(app).post('/api/reportes/ventas/enviar').set(admin).send({ desde: HOY, hasta: HOY, para: 'no-es-un-correo' }).expect(400);
  });

  it('solo el personal con permiso lo ve', async () => {
    await request(app).get(`/api/reportes/ventas?desde=${HOY}&hasta=${HOY}`).set(cocinero).expect(403);
    await request(app).get(`/api/reportes/pedidos?desde=${HOY}&hasta=${HOY}`).set(cliente).expect(403);
    await request(app).get(`/api/reportes/ventas?desde=${HOY}&hasta=${HOY}`).expect(401);
  });
});

describe('HU-29 · Reporte de pedidos', () => {
  beforeAll(async () => {
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(101, { estado: 'Entregado', estadoPago: 'Pagado', repartidor: RODRIGO, entrega: enHora(10, HOY).replace('T14:00', 'T14:40') })));
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(102, { estado: 'Cancelado', repartidor: RODRIGO, motivo: 'No entregado' })));
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(103, { estado: 'En camino', repartidor: { id: 8, nombre: 'Rosa Ruta' } })));
  });

  it('los cancelados no suman y se distinguen asignados de entregados', async () => {
    const r = await request(app).get(`/api/reportes/pedidos?desde=${HOY}&hasta=${HOY}`).set(admin).expect(200);
    expect(r.body.resumen).toMatchObject({ cantidadPedidos: 3, entregados: 1, cancelados: 1, total: 100, minutosPromedio: 40 });
    expect(r.body.porRepartidor).toEqual([
      { repartidor: 'Rodrigo Reparto', asignados: 2, entregas: 1, minutosPromedio: 40 },
      { repartidor: 'Rosa Ruta', asignados: 1, entregas: 0, minutosPromedio: null },
    ]);
    // La ganancia es de lo entregado (lo que tiene costo); lo demás figura sin costo.
    expect(r.body.resumen).toMatchObject({ costo: 26, ganancia: 24, unidadesSinCosto: 2 });
  });

  it('se filtra por estado y por repartidor', async () => {
    const r = await request(app).get(`/api/reportes/pedidos?desde=${HOY}&hasta=${HOY}&idRepartidor=7&estado=Entregado`).set(admin).expect(200);
    expect(r.body).toMatchObject({ repartidor: 'Rodrigo Reparto', estado: 'Entregado', resumen: { cantidadPedidos: 1 } });
    await request(app).get(`/api/reportes/pedidos?desde=${HOY}&hasta=${HOY}&estado=Perdido`).set(admin).expect(400);
  });

  it('al arrancar completa la copia con la lista de ms-ventas y de ms-pedidos', async () => {
    listas.ventas = [venta(201, { hora: 9 })];
    listas.pedidos = [pedido(202, { estado: 'Recibido' })];
    await sincronizar();
    const r = await request(app).get(`/api/reportes/pedidos?desde=${HOY}&hasta=${HOY}`).set(admin).expect(200);
    expect(r.body.pedidos.map((p: { id: number }) => p.id)).toContain(202);
    // La lista completa no manda correos: serían avisos atrasados.
    expect(await avisosDe(202)).toEqual([]);
  });
});

describe('HU-32 · Avisos al cliente por correo', () => {
  it('pedido en efectivo: recibido, en camino y entregado con el comprobante en PDF', async () => {
    buzonLocal.length = 0;
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(301)));
    // Asignar repartidor no cambia la etapa: no hay aviso.
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(301, { repartidor: RODRIGO })));
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(301, { estado: 'En camino', repartidor: RODRIGO })));
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(301, { estado: 'Entregado', estadoPago: 'Pagado', repartidor: RODRIGO, entrega: ahora() })));
    expect((await avisosDe(301)).map((a) => a.tipo)).toEqual(['pedido-recibido', 'en-camino', 'comprobante-entrega']);

    expect(await enviarPendientes()).toBeGreaterThanOrEqual(3);
    const enviados = buzonLocal.filter((c) => c.asunto.includes('00301'));
    expect(enviados.map((c) => c.para)).toEqual(['camila@correo.bo', 'camila@correo.bo', 'camila@correo.bo']);
    expect(enviados[1].texto).toMatch(/Tenga listos Bs 50,00/);
    expect(enviados[2].adjuntos![0]).toMatchObject({ nombre: 'comprobante-pedido-301.pdf', tipo: 'application/pdf' });
    expect(enviados[2].responderA).toBe('soporte@nutriexpress.bo');
    expect((await avisosDe(301)).every((a) => a.estado === 'Enviado')).toBe(true);
  });

  it('pago en línea: el comprobante sale cuando se acredita, no antes', async () => {
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(302, { estado: 'Pendiente de pago', metodo: 'QR' })));
    expect(await avisosDe(302)).toEqual([]);
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(302, { estado: 'Recibido', estadoPago: 'Pagado', metodo: 'QR' })));
    expect((await avisosDe(302)).map((a) => a.tipo)).toEqual(['comprobante-pago']);
  });

  it('si lo canceló el cliente no se le avisa; si no se pudo entregar, sí', async () => {
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(303, { estado: 'Cancelado', motivo: 'Cancelado por el cliente' })));
    expect(await avisosDe(303)).toEqual([]);
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(304, { estado: 'En camino', repartidor: RODRIGO })));
    await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', pedido(304, { estado: 'Cancelado', motivo: 'No entregado', repartidor: RODRIGO })));
    expect((await avisosDe(304)).map((a) => a.tipo)).toEqual(['en-camino', 'no-entregado']);
  });

  it('el mismo evento dos veces anota un solo aviso', async () => {
    const e = evento('PedidoEstadoCambiado', pedido(305));
    await pedidoEstadoCambiado(e);
    await bd().then((b) => b.collection('pedidos').deleteOne({ _id: 305 as never }));
    await pedidoEstadoCambiado(e);
    expect(await avisosDe(305)).toHaveLength(1);
  });

  it('si no se puede averiguar el correo, el aviso espera y el reporte igual queda al día', async () => {
    clientes.set(61, { email: 'otro@correo.bo', nombreCompleto: 'Otro Cliente' });
    control.identidadCaida = true;
    try {
      await pedidoEstadoCambiado(evento('PedidoEstadoCambiado', { ...pedido(306), idUsuario: 61 }));
      await enviarPendientes();
      const [aviso] = await avisosDe(306);
      expect(aviso).toMatchObject({ estado: 'Pendiente', intentos: 1, ultimoError: expect.stringMatching(/503/) });
      const r = await request(app).get(`/api/reportes/pedidos?desde=${HOY}&hasta=${HOY}`).set(admin).expect(200);
      expect(r.body.pedidos.map((p: { id: number }) => p.id)).toContain(306);
    } finally {
      control.identidadCaida = false;
    }
    await enviarPendientes();
    expect((await avisosDe(306))[0]).toMatchObject({ estado: 'Enviado', para: 'otro@correo.bo' });
  });
});
