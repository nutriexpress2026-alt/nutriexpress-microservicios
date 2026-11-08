import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from '../models/stock.model.js';
import * as reservaModel from '../models/reserva.model.js';
import * as productoModel from '../models/producto.model.js';
import * as empleadoModel from '../models/empleado.model.js';
import * as reservaService from './reserva.service.js';
import * as egresoService from './egreso.service.js';
import * as ingresoService from './ingreso.service.js';
import type { LineaConsolidada } from './movimiento.comun.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * HU-18, HU-24 · La salida de productos terminados vendidos (RF-VEN-04).
 *
 * Una venta de mostrador o un pedido entregado **consume** su reserva (HU-17): la
 * reserva pasa a Consumida y, en la misma transacción, se registra la nota de
 * egreso con motivo Venta, repartida entre los almacenes que tienen el producto.
 * Anular una venta la **devuelve**: nota de ingreso con motivo Devolución a los
 * mismos almacenes de los que salió (HU-19).
 */

export interface Empleado {
  id: number;
  nombre: string;
  apellido: string;
}

export interface LineaSalida {
  idProducto: number;
  idAlmacen: number;
  cantidad: number;
}

/** Lo que devuelve la salida: con el nombre del almacén, que el comprobante muestra. */
export interface LineaVendida extends LineaSalida {
  almacen: string;
}

export interface SalidaDTO {
  idNotaEgreso: number | null;
  lineas: LineaVendida[];
  /** La reserva ya se había consumido: la petición llegó dos veces. */
  yaConsumida: boolean;
}

/** Reparte lo reservado de cada producto entre los almacenes con stock, del que más tiene al que menos. */
async function repartirProductos(tx: ClientePrisma, reserva: reservaModel.ReservaCompleta): Promise<LineaConsolidada[]> {
  const costos = await productoModel.costosPromedio(reserva.detalle_reserva_producto.map((d) => d.id_producto), tx);
  const lineas: LineaConsolidada[] = [];
  for (const d of reserva.detalle_reserva_producto) {
    let restante = d.cantidad;
    for (const e of await reservaModel.existenciasProductoPorAlmacen(tx, d.id_producto)) {
      if (restante <= 0) break;
      const toma = Math.min(restante, e.stock);
      if (toma > 0) {
        lineas.push({ idItem: d.id_producto, idAlmacen: e.idAlmacen, cantidad: toma, costoUnitario: costos.get(d.id_producto) ?? 0 });
      }
      restante -= toma;
    }
    // No debería pasar: lo reservado no se puede sacar por otro lado (HU-17).
    if (restante > 0) throw new ErrorApp(409, `No alcanza ${d.producto.nombre} en los almacenes`);
  }
  return lineas;
}

/** Consume la reserva y registra la nota de egreso por venta. Repetirlo no descuenta dos veces. */
export async function consumirParaVenta(idReserva: string, datos: { observacion: string; empleado: Empleado }): Promise<SalidaDTO> {
  // La nota lleva quién vendió o entregó (réplica del empleado, RNF-ARQ-02).
  await empleadoModel.guardar(datos.empleado.id, datos.empleado.nombre, datos.empleado.apellido);
  return prisma.$transaction(
    async (tx: ClientePrisma) => {
      const reserva = await reservaService.consumirEnTransaccion(tx, idReserva);
      if (!reserva) return { idNotaEgreso: null, lineas: [], yaConsumida: true };
      const productos = await repartirProductos(tx, reserva);
      const idNotaEgreso = await egresoService.registrarEnTransaccion(tx, {
        motivo: 'Venta',
        observacion: datos.observacion,
        insumos: [],
        productos,
        idEmpleado: datos.empleado.id,
      });
      const almacenes = await tx.almacen.findMany({
        where: { id_almacen: { in: productos.map((l) => l.idAlmacen) } },
        select: { id_almacen: true, nombre: true },
      });
      const nombreDe = new Map(almacenes.map((a) => [a.id_almacen, a.nombre]));
      return {
        idNotaEgreso,
        lineas: productos.map((l) => ({
          idProducto: l.idItem,
          idAlmacen: l.idAlmacen,
          almacen: nombreDe.get(l.idAlmacen) ?? '',
          cantidad: l.cantidad,
        })),
        yaConsumida: false,
      };
    },
    { timeout: 15000 },
  );
}

/**
 * HU-19 · Devuelve al stock lo de una venta anulada, a los mismos almacenes. La
 * referencia («Venta 12 anulada») identifica la devolución: pedirla dos veces no
 * suma dos veces.
 */
export async function devolver(datos: { referencia: string; lineas: LineaSalida[]; empleado: Empleado }): Promise<{ idNotaIngreso: number }> {
  await empleadoModel.guardar(datos.empleado.id, datos.empleado.nombre, datos.empleado.apellido);
  const previa = await prisma.nota_ingreso.findFirst({
    where: { motivo: 'Devolucion', numero_documento: datos.referencia },
    select: { id_nota_ingreso: true },
  });
  if (previa) return { idNotaIngreso: previa.id_nota_ingreso };

  return prisma.$transaction(
    async (tx: ClientePrisma) => {
      const costos = await productoModel.costosPromedio(datos.lineas.map((l) => l.idProducto), tx);
      const idNotaIngreso = await ingresoService.registrarEnTransaccion(tx, {
        motivo: 'Devolucion',
        proveedor: null,
        numeroDocumento: datos.referencia,
        insumos: [],
        productos: datos.lineas.map((l) => ({
          idItem: l.idProducto,
          idAlmacen: l.idAlmacen,
          cantidad: l.cantidad,
          costoUnitario: costos.get(l.idProducto) ?? 0,
        })),
        idEmpleado: datos.empleado.id,
      });
      return { idNotaIngreso };
    },
    { timeout: 15000 },
  );
}
