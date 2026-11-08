import { randomUUID } from 'node:crypto';
import { prisma } from '../config/prisma.js';
import type { Evento } from '../config/eventos.js';
import * as ventaModel from '../models/venta.model.js';
import type { ClientePrisma, FiltroVentas, VentaConsultada } from '../models/venta.model.js';
import * as servicios from '../clientes/servicios.js';
import { pagina, type Pagina } from '../dtos/paginacion.dto.js';
import type { AnulacionVentaDTO, ComprobanteDTO, DatosCrearVenta, LineaVentaDTO, VentaDTO } from '../dtos/venta.dto.js';
import type { EstadoPagoVenta, MetodoPagoVenta, TipoVenta } from '../config/dominio.js';
import { avisar } from './aviso.service.js';
import type { Sesion } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * HU-18 · Venta de mostrador y HU-19 · Comprobante y anulación, adaptado del
 * sistema anterior.
 *
 * Allí todo era una transacción de la misma base; aquí la venta pasa por cuatro
 * servicios y cada paso tiene su compensación: el precio lo da el catálogo
 * (RF-VEN-03); el stock se **reserva** y se **consume** en inventario, con la
 * nota de egreso por venta (RF-VEN-04, RF-VEN-05); si se cobra con QR, ms-pagos
 * abre el cobro. Anular devuelve el stock a los almacenes de los que salió y
 * cierra el cobro (RF-VEN-07).
 */

const nombreDe = (s: { nombre: string; apellido: string }) => `${s.nombre} ${s.apellido}`.trim();

/** Suma en centavos: sin arrastre de error del punto flotante. */
const importe = (cantidad: number, precio: number) => Math.round(precio * 100) * cantidad;

function exigirEmpleado(sesion: Sesion, para: string) {
  if (!sesion.cargo) throw new ErrorApp(403, `Solo el personal puede ${para}`);
  return { id: sesion.idUsuario, nombre: sesion.nombre, apellido: sesion.apellido };
}

function aLineas(v: VentaConsultada): LineaVentaDTO[] {
  return v.detalle_venta.map((d) => ({
    idProducto: d.id_producto,
    nombre: d.nombre_producto,
    almacen: d.nombre_almacen,
    cantidad: d.cantidad,
    precioUnitario: Number(d.precio_unitario),
    subtotal: importe(d.cantidad, Number(d.precio_unitario)) / 100,
  }));
}

function aDTO(v: VentaConsultada): VentaDTO {
  return {
    id: v.id_venta,
    fecha: v.fecha.toISOString(),
    tipoVenta: v.tipo_venta as TipoVenta,
    metodoPago: v.metodo_pago as MetodoPagoVenta,
    estadoPago: v.estado_pago as EstadoPagoVenta,
    total: Number(v.total),
    cliente: v.id_cliente === null ? null : { id: v.id_cliente, nombreCompleto: v.cliente_nombre ?? '' },
    atendidoPor: { id: v.id_empleado, nombreCompleto: nombreDe({ nombre: v.empleado_nombre, apellido: v.empleado_apellido }) },
    items: aLineas(v),
  };
}

async function exigirVenta(id: number): Promise<VentaConsultada> {
  const venta = await ventaModel.buscarPorId(id);
  if (!venta) throw new ErrorApp(404, 'La venta no existe');
  return venta;
}

function consolidarItems(items: DatosCrearVenta['items']) {
  const porProducto = new Map<number, number>();
  for (const i of items) porProducto.set(i.idProducto, (porProducto.get(i.idProducto) ?? 0) + i.cantidad);
  return [...porProducto].map(([idProducto, cantidad]) => ({ idProducto, cantidad }));
}

/** Para el evento que alimentará los reportes de ventas (Sprint 6). */
const avisarVenta = (v: VentaConsultada, estado: EstadoPagoVenta) =>
  avisar('VentaRegistrada', {
    idVenta: v.id_venta,
    estado,
    tipoVenta: v.tipo_venta,
    metodoPago: v.metodo_pago,
    total: Number(v.total),
    idCliente: v.id_cliente,
    fecha: v.fecha.toISOString(),
  });

/* ------------------------------------------------------------------ */
/* HU-18 · Registrar la venta                                          */
/* ------------------------------------------------------------------ */

export async function crear(sesion: Sesion, datos: DatosCrearVenta): Promise<VentaDTO> {
  const empleado = exigirEmpleado(sesion, 'registrar ventas');
  const items = consolidarItems(datos.items);

  // HU-20 · El cliente es opcional; si se indica, tiene que existir (ms-identidad).
  let cliente: { id: number; nombreCompleto: string } | null = null;
  if (datos.idCliente) {
    const c = await servicios.cliente(datos.idCliente);
    if (!c.activo) throw new ErrorApp(409, 'El cliente indicado está dado de baja');
    cliente = { id: c.id, nombreCompleto: c.nombreCompleto };
  }

  // RF-VEN-03 · El precio lo pone el sistema.
  const precios = new Map((await servicios.preciosDe(items.map((i) => i.idProducto))).map((p) => [p.id, p]));
  const noDisponibles = items.filter((i) => !precios.get(i.idProducto)?.activo);
  if (noDisponibles.length > 0) {
    const nombres = noDisponibles.map((i) => precios.get(i.idProducto)?.nombre ?? `el producto ${i.idProducto}`);
    throw new ErrorApp(409, `Hay productos que ya no están disponibles: ${nombres.join(', ')}`);
  }

  // RF-VEN-05 · «Sin stock no se confirma»: la reserva responde 409 con lo que falta.
  const idReserva = `venta-${randomUUID()}`;
  await servicios.reservar(idReserva, items);

  // RF-VEN-04 · «Al confirmar se descuenta el stock»: la reserva se consume.
  let salida: Awaited<ReturnType<typeof servicios.consumir>>;
  try {
    salida = await servicios.consumir(idReserva, 'Venta de mostrador', empleado);
  } catch (e) {
    await servicios.liberar(idReserva).catch(() => undefined);
    throw e;
  }

  const lineas = salida.lineas.map((l) => ({
    ...l,
    nombre: precios.get(l.idProducto)!.nombre,
    precioUnitario: Number(precios.get(l.idProducto)!.precioVenta),
  }));
  const total = lineas.reduce((t, l) => t + importe(l.cantidad, l.precioUnitario), 0) / 100;
  const enLinea = datos.metodoPago === 'QR';

  let venta: VentaConsultada;
  try {
    venta = await prisma.$transaction((tx: ClientePrisma) =>
      ventaModel.crear(tx, {
        tipoVenta: datos.tipoVenta,
        metodoPago: datos.metodoPago,
        estadoPago: enLinea ? 'Pendiente' : 'Pagado',
        total,
        idCliente: cliente?.id ?? null,
        clienteNombre: cliente?.nombreCompleto ?? null,
        empleado,
        idReserva,
        idNotaEgreso: salida.idNotaEgreso,
        lineas,
      }),
    );
  } catch (e) {
    // Compensación: la venta no llegó a existir; lo que salió vuelve al stock.
    await servicios.devolver(`Venta no registrada ${idReserva}`, salida.lineas, empleado).catch(() => undefined);
    throw e;
  }

  const dto = aDTO(venta);
  if (!enLinea) {
    // El efectivo ya está en la caja: queda registrado en ms-pagos. Si no responde,
    // la venta sigue siendo válida; el cobro se ve en la venta, no al revés.
    dto.cobro = await servicios.registrarEfectivo(venta.id_venta, total, nombreDe(empleado)).catch(() => null);
    await avisarVenta(venta, 'Pagado');
    return dto;
  }

  try {
    const cobro = await servicios.abrirCobro(venta.id_venta, total);
    await ventaModel.registrarCobro(venta.id_venta, cobro.id);
    dto.cobro = cobro;
    return dto;
  } catch (e) {
    // Sin QR no hay cómo cobrar: la venta se anula y el stock vuelve.
    await anularInterno(venta, 'No se pudo abrir el cobro con QR', empleado);
    const motivo = e instanceof ErrorApp ? e.message : 'la pasarela no respondió';
    throw new ErrorApp(503, `No se pudo abrir el cobro con QR (${motivo}). Intente de nuevo o cobre en efectivo.`);
  }
}

/**
 * Lo que el punto de venta pregunta antes de vender más de lo que muestra: cuánto
 * hay de cada producto. La «producción al instante» del sistema anterior no se
 * incluye: si falta stock, la venta no se confirma (RF-VEN-05).
 */
export async function evaluar(sesion: Sesion, items: { idProducto: number; cantidad: number }[]) {
  exigirEmpleado(sesion, 'registrar ventas');
  const lineasPedidas = consolidarItems(items);
  const ids = lineasPedidas.map((i) => i.idProducto);
  const [precios, stock] = await Promise.all([servicios.preciosDe(ids), servicios.existencias(ids)]);
  const nombreDeProducto = new Map(precios.map((p) => [p.id, p.nombre]));
  const disponible = new Map(stock.map((s) => [s.idProducto, Math.max(0, s.stockTotal - (s.reservado ?? 0))]));
  const lineas = lineasPedidas.map((i) => {
    const enStock = disponible.get(i.idProducto) ?? 0;
    const faltante = Math.max(0, i.cantidad - enStock);
    return {
      idProducto: i.idProducto,
      nombre: nombreDeProducto.get(i.idProducto) ?? `Producto ${i.idProducto}`,
      solicitado: i.cantidad,
      enStock,
      faltante,
      requiereProduccion: false,
      producible: false,
      motivo: faltante > 0 ? `Faltan ${faltante}: no hay stock suficiente` : undefined,
      cantidadAProducir: 0,
      excedente: 0,
      insumos: [],
      costoProduccion: 0,
      almacenesCompatibles: [],
      insumosFaltantes: [],
      requiereElegirAlmacen: false,
    };
  });
  return { lineas, requiereProduccion: false, puedeVenderse: lineas.every((l) => l.faltante === 0), insumosFaltantes: [] };
}

/* ------------------------------------------------------------------ */
/* Consultas y comprobante                                             */
/* ------------------------------------------------------------------ */

export async function listar(sesion: Sesion, filtro: FiltroVentas): Promise<Pagina<VentaDTO>> {
  exigirEmpleado(sesion, 'consultar las ventas');
  const [ventas, total] = await ventaModel.listar(filtro);
  return pagina(ventas.map(aDTO), total, filtro);
}

/** Si el aviso del cobro se perdió, la venta se pone al día al mirarla. */
async function ponerAlDia(v: VentaConsultada): Promise<servicios.Cobro | null> {
  if (v.metodo_pago !== 'QR') return null;
  const cobro = await servicios.cobroDe(v.id_venta);
  if (v.estado_pago === 'Pendiente' && cobro) {
    if (cobro.estado === 'Pagado') await ventaModel.marcarPagada(v.id_venta);
    else if (cobro.estado !== 'Pendiente') await anularInterno(v, 'El cobro con QR no se completó');
  }
  return cobro;
}

export async function obtener(sesion: Sesion, id: number): Promise<VentaDTO> {
  exigirEmpleado(sesion, 'consultar las ventas');
  const cobro = await ponerAlDia(await exigirVenta(id));
  const dto = aDTO(await exigirVenta(id));
  dto.cobro = cobro;
  return dto;
}

/** HU-19 · «El comprobante muestra productos, total y método.» Los de un mismo producto se unen. */
export async function comprobante(sesion: Sesion, id: number): Promise<ComprobanteDTO> {
  exigirEmpleado(sesion, 'consultar las ventas');
  const v = await exigirVenta(id);
  const porProducto = new Map<number, LineaVentaDTO>();
  for (const l of aLineas(v)) {
    const previa = porProducto.get(l.idProducto);
    if (previa) {
      previa.cantidad += l.cantidad;
      previa.subtotal = importe(previa.cantidad, previa.precioUnitario) / 100;
      previa.almacen = 'Varios';
    } else porProducto.set(l.idProducto, { ...l });
  }
  const detalle = [...porProducto.values()];
  return {
    numero: `V-${String(v.id_venta).padStart(6, '0')}`,
    fecha: v.fecha.toISOString(),
    tipoVenta: v.tipo_venta as TipoVenta,
    metodoPago: v.metodo_pago as MetodoPagoVenta,
    cliente: v.cliente_nombre ?? 'Consumidor final',
    atendidoPor: nombreDe({ nombre: v.empleado_nombre, apellido: v.empleado_apellido }),
    detalle,
    cantidadItems: detalle.reduce((t, l) => t + l.cantidad, 0),
    total: Number(v.total),
  };
}

/* ------------------------------------------------------------------ */
/* HU-19 · Anular                                                      */
/* ------------------------------------------------------------------ */

/** Anula, devuelve el stock y cierra el cobro. Idempotente: anular dos veces no devuelve dos veces. */
async function anularInterno(
  v: VentaConsultada,
  motivo: string,
  quien: servicios.Empleado = { id: v.id_empleado, nombre: v.empleado_nombre, apellido: v.empleado_apellido },
): Promise<{ requiereDevolucion: boolean } | null> {
  if (!(await ventaModel.anularSiNoLoEsta(v.id_venta, motivo))) return null;
  const lineas = v.detalle_venta.map((d) => ({ idProducto: d.id_producto, idAlmacen: d.id_almacen, cantidad: d.cantidad }));
  await servicios.devolver(`Venta ${v.id_venta} anulada`, lineas, quien);
  const cobro = await servicios.anularCobro(v.id_venta, `Anulada por ${nombreDe(quien)}. Motivo: ${motivo}`).catch(() => ({
    requiereDevolucion: v.estado_pago === 'Pagado',
  }));
  await avisarVenta(v, 'Anulado');
  return cobro;
}

export async function anular(sesion: Sesion, id: number, motivo: string): Promise<AnulacionVentaDTO> {
  const empleado = exigirEmpleado(sesion, 'anular ventas');
  const venta = await exigirVenta(id);
  if (venta.estado_pago === 'Anulado') throw new ErrorApp(409, 'La venta ya está anulada');
  const cierre = await anularInterno(venta, motivo, empleado);
  if (!cierre) throw new ErrorApp(409, 'La venta se anuló durante la operación');
  return {
    venta: aDTO(await exigirVenta(id)),
    requiereDevolucion: cierre.requiereDevolucion,
    aviso: cierre.requiereDevolucion
      ? 'La venta estaba cobrada: corresponde devolverle el dinero al cliente. El sistema registró el reembolso, pero no lo entrega.'
      : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* HU-26 · Desenlace del cobro con QR (eventos de ms-pagos)            */
/* ------------------------------------------------------------------ */

interface DatosDesenlace {
  idVenta: number | null;
}

export async function pagoConfirmado(evento: Evento<DatosDesenlace>): Promise<void> {
  // Los cobros de pedidos a domicilio no son de este servicio.
  if (evento.datos.idVenta === null) return;
  if (await ventaModel.marcarPagada(evento.datos.idVenta)) {
    const v = await ventaModel.buscarPorId(evento.datos.idVenta);
    if (v) await avisarVenta(v, 'Pagado');
  }
}

/** El QR venció o se anuló: la venta pendiente se anula y su stock vuelve. */
export async function pagoFallido(evento: Evento<DatosDesenlace>): Promise<void> {
  if (evento.datos.idVenta === null) return;
  const v = await ventaModel.buscarPorId(evento.datos.idVenta);
  if (v && v.estado_pago === 'Pendiente') await anularInterno(v, 'El cobro con QR no se completó');
}
