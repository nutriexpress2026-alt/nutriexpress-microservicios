import { prisma } from '../config/prisma.js';
import * as reservaModel from '../models/reserva.model.js';
import type { ReservaCompleta } from '../models/reserva.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import { ErrorApp } from '../errors/error-app.js';
import { formatearCantidad, redondearCantidad } from '../utils/cantidad.js';
import { dosDecimales } from '../utils/dinero.js';

/**
 * HU-17 · Reservar y liberar stock cuando otros servicios lo piden.
 *
 * Criterios de aceptación: una reserva sin stock se rechaza; una reserva
 * liberada vuelve al disponible; repetir la misma reserva no descuenta dos
 * veces. Disponible = stock de todos los almacenes - lo reservado en reservas
 * activas.
 */

export interface PedidoReserva {
  /** Lo pone quien reserva ('orden-12'): con él, repetir no descuenta dos veces. */
  id: string;
  origen: string;
  insumos: { idIngrediente: number; cantidad: number }[];
  productos: { idProducto: number; cantidad: number }[];
  /** Producción: adónde entrará el producto terminado. Sin almacén, se deduce (preferido o único). */
  destino?: { idProducto: number; idAlmacen?: number | null } | null;
}

export interface PrevisionDTO {
  insumos: { idIngrediente: number; nombre: string; unidad: string; cantidad: number; costoUnitario: number }[];
  productos: { idProducto: number; nombre: string; cantidad: number }[];
  /** Lo que cuestan hoy los insumos pedidos. */
  costoInsumos: number;
  almacenDestino: { id: number; nombre: string } | null;
}

export interface ReservaDTO extends PrevisionDTO {
  id: string;
  origen: string;
  estado: string;
}

const costoDe = (lineas: PrevisionDTO['insumos']) =>
  dosDecimales(lineas.reduce((t, l) => t + dosDecimales(l.cantidad * l.costoUnitario), 0));

function aDTO(r: ReservaCompleta): ReservaDTO {
  const insumos = r.detalle_reserva_insumo.map((d) => ({
    idIngrediente: d.id_ingrediente,
    nombre: d.ingrediente.nombre,
    unidad: d.ingrediente.unidad_medida.abreviatura,
    cantidad: Number(d.cantidad),
    costoUnitario: Number(d.ingrediente.costo_unitario),
  }));
  return {
    id: r.id_reserva,
    origen: r.origen,
    estado: r.estado,
    insumos,
    productos: r.detalle_reserva_producto.map((d) => ({ idProducto: d.id_producto, nombre: d.producto.nombre, cantidad: d.cantidad })),
    costoInsumos: costoDe(insumos),
    almacenDestino: r.almacen ? { id: r.almacen.id_almacen, nombre: r.almacen.nombre } : null,
  };
}

type Saldos = Awaited<ReturnType<typeof reservaModel.saldosDeInsumos>>;

/** Lo que falta para cubrir cada línea, en palabras; vacío si alcanza. */
function faltantes(lineas: { id: number; cantidad: number }[], saldos: Saldos, que: string): string[] {
  return lineas.flatMap(({ id, cantidad }) => {
    const s = saldos.get(id);
    if (!s) return [`el ${que} ${id} no existe`];
    if (!s.activo) return [`${s.nombre} está dado de baja`];
    const disponible = Math.max(0, redondearCantidad(s.stock - s.reservado));
    if (cantidad <= disponible + 1e-9) return [];
    return [
      `${s.nombre}: se necesitan ${formatearCantidad(cantidad)} ${s.unidad} y hay ${formatearCantidad(disponible)} ${s.unidad} disponibles`,
    ];
  });
}

async function revisar(tx: ClientePrisma, pedido: Omit<PedidoReserva, 'id' | 'origen'>) {
  const [insumos, productos] = await Promise.all([
    reservaModel.saldosDeInsumos(tx, pedido.insumos.map((l) => l.idIngrediente)),
    reservaModel.saldosDeProductos(tx, pedido.productos.map((l) => l.idProducto)),
  ]);
  const problemas = [
    ...faltantes(pedido.insumos.map((l) => ({ id: l.idIngrediente, cantidad: l.cantidad })), insumos, 'insumo'),
    ...faltantes(pedido.productos.map((l) => ({ id: l.idProducto, cantidad: l.cantidad })), productos, 'producto'),
  ];
  if (problemas.length > 0) throw new ErrorApp(409, `Stock insuficiente: ${problemas.join('; ')}`);

  const lineas = pedido.insumos.map((l) => {
    const s = insumos.get(l.idIngrediente)!;
    return { idIngrediente: l.idIngrediente, nombre: s.nombre, unidad: s.unidad, cantidad: l.cantidad, costoUnitario: s.costoUnitario };
  });
  return {
    insumos: lineas,
    productos: pedido.productos.map((l) => ({ idProducto: l.idProducto, nombre: productos.get(l.idProducto)!.nombre, cantidad: l.cantidad })),
    costoInsumos: costoDe(lineas),
    almacenDestino: await resolverDestino(tx, pedido.destino),
  };
}

/**
 * El almacén al que entrará el producto terminado (CU-INV-02: del tipo de
 * conservación del producto). Si no se indica, el preferido de ese tipo o, si
 * hay uno solo, ese; si hay varios sin preferido, hay que elegir.
 */
async function resolverDestino(tx: ClientePrisma, destino: PedidoReserva['destino']) {
  if (!destino) return null;
  const producto = await tx.producto.findUnique({ where: { id_producto: destino.idProducto } });
  if (!producto) throw new ErrorApp(404, `El producto ${destino.idProducto} no está registrado en inventario`);
  const tipo = producto.tipo_conservacion;
  const almacenes = await reservaModel.almacenesDeTipo(tx, tipo);

  if (destino.idAlmacen) {
    const elegido = almacenes.find((a) => a.id_almacen === destino.idAlmacen);
    if (!elegido) {
      throw new ErrorApp(409, `"${producto.nombre}" necesita conservación ${tipo} y el almacén elegido no lo es`);
    }
    return { id: elegido.id_almacen, nombre: elegido.nombre };
  }
  const deducido = almacenes.find((a) => a.preferido) ?? (almacenes.length === 1 ? almacenes[0] : null);
  if (!deducido) {
    throw new ErrorApp(
      409,
      almacenes.length === 0
        ? `No hay almacenes de conservación ${tipo} para guardar "${producto.nombre}"`
        : `Hay ${almacenes.length} almacenes de conservación ${tipo}: elija a cuál entra "${producto.nombre}"`,
    );
  }
  return { id: deducido.id_almacen, nombre: deducido.nombre };
}

/** Comprueba si alcanza y cuánto cuesta, sin reservar (para registrar una orden). */
export function verificar(pedido: Omit<PedidoReserva, 'id' | 'origen'>): Promise<PrevisionDTO> {
  return prisma.$transaction((tx) => revisar(tx, pedido));
}

/**
 * Reserva, o devuelve la que ya existía con ese id (repetir no descuenta dos
 * veces). Bloquea los ítems: dos reservas a la vez no se reparten más de lo que hay.
 */
export async function reservar(pedido: PedidoReserva): Promise<{ reserva: ReservaDTO; nueva: boolean }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existente = await reservaModel.buscar(pedido.id, tx);
      // Una liberada se puede volver a pedir con el mismo id (por ejemplo, la
      // orden cuya finalización falló y se reintenta): se reemplaza. Una activa
      // o consumida se devuelve tal cual, sin descontar otra vez.
      if (existente && existente.estado !== 'Liberada') return { reserva: aDTO(existente), nueva: false };
      if (existente) await reservaModel.quitar(tx, pedido.id);

      await reservaModel.bloquear(
        tx,
        pedido.insumos.map((l) => l.idIngrediente),
        pedido.productos.map((l) => l.idProducto),
      );
      const prevision = await revisar(tx, pedido);
      await reservaModel.crear(tx, {
        id: pedido.id,
        origen: pedido.origen,
        idAlmacenDestino: prevision.almacenDestino?.id ?? null,
        insumos: pedido.insumos,
        productos: pedido.productos,
      });
      return { reserva: aDTO((await reservaModel.buscar(pedido.id, tx))!), nueva: true };
    });
  } catch (e) {
    // Dos pedidos con el mismo id al mismo tiempo: el segundo choca con la clave; vale la del primero.
    if ((e as { code?: string }).code === 'P2002') {
      return { reserva: await obtener(pedido.id), nueva: false };
    }
    throw e;
  }
}

export async function obtener(id: string): Promise<ReservaDTO> {
  const reserva = await reservaModel.buscar(id);
  if (!reserva) throw new ErrorApp(404, `La reserva ${id} no existe`);
  return aDTO(reserva);
}

/** Lo reservado vuelve al disponible. Liberar dos veces no es un error. */
export async function liberar(id: string): Promise<ReservaDTO> {
  return prisma.$transaction(async (tx) => {
    const reserva = await reservaModel.buscar(id, tx);
    if (!reserva) throw new ErrorApp(404, `La reserva ${id} no existe`);
    if (reserva.estado === 'Consumida') throw new ErrorApp(409, 'La reserva ya se consumió: no se puede liberar');
    await reservaModel.cerrar(tx, id, 'Liberada');
    return aDTO((await reservaModel.buscar(id, tx))!);
  });
}

/**
 * La reserva pasa a Consumida dentro de la transacción que registra sus
 * movimientos (HU-10). Devuelve null si ya se había consumido: el evento que la
 * consume pudo llegar dos veces.
 */
export async function consumirEnTransaccion(tx: ClientePrisma, id: string): Promise<ReservaCompleta | null> {
  const reserva = await reservaModel.buscar(id, tx);
  if (!reserva) throw new ErrorApp(404, `La reserva ${id} no existe`);
  if (reserva.estado === 'Consumida') return null;
  if (!(await reservaModel.cerrar(tx, id, 'Consumida'))) {
    throw new ErrorApp(409, `La reserva ${id} fue liberada: ya no se puede consumir`);
  }
  return reserva;
}

/**
 * Una salida manual (merma, ajuste, devolución) no puede llevarse lo reservado
 * para otra operación: después de sacar, tiene que seguir quedando lo reservado.
 */
export async function exigirNoTocarReservado(
  tx: ClientePrisma,
  insumos: { idItem: number; cantidad: number }[],
  productos: { idItem: number; cantidad: number }[],
): Promise<void> {
  const total = (lineas: { idItem: number; cantidad: number }[]) => {
    const suma = new Map<number, number>();
    for (const l of lineas) suma.set(l.idItem, (suma.get(l.idItem) ?? 0) + l.cantidad);
    return suma;
  };
  const salenInsumos = total(insumos);
  const salenProductos = total(productos);
  await reservaModel.bloquear(tx, [...salenInsumos.keys()], [...salenProductos.keys()]);

  const [saldosInsumo, saldosProducto] = await Promise.all([
    reservaModel.saldosDeInsumos(tx, [...salenInsumos.keys()]),
    reservaModel.saldosDeProductos(tx, [...salenProductos.keys()]),
  ]);
  const problemas = [...[...salenInsumos].map(([id, c]) => [saldosInsumo.get(id), c] as const), ...[...salenProductos].map(([id, c]) => [saldosProducto.get(id), c] as const)]
    .filter(([s, sale]) => s && s.reservado > 0 && s.stock - sale < s.reservado - 1e-9)
    .map(([s]) => {
      const libre = Math.max(0, redondearCantidad(s!.stock - s!.reservado));
      return `${s!.nombre}: ${formatearCantidad(s!.reservado)} ${s!.unidad} están reservados para otra operación y se pueden sacar hasta ${formatearCantidad(libre)} ${s!.unidad}`;
    });
  if (problemas.length > 0) throw new ErrorApp(409, `No se puede registrar la salida: ${problemas.join('; ')}`);
}
