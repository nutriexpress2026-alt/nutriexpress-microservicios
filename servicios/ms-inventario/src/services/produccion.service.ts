import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import type { Evento } from '../config/eventos.js';
import type { ClientePrisma } from '../models/stock.model.js';
import type { ReservaCompleta } from '../models/reserva.model.js';
import * as reservaModel from '../models/reserva.model.js';
import * as empleadoModel from '../models/empleado.model.js';
import * as reservaService from './reserva.service.js';
import * as egresoService from './egreso.service.js';
import * as ingresoService from './ingreso.service.js';
import type { LineaConsolidada } from './movimiento.comun.js';
import { avisar } from './aviso.service.js';
import { dosDecimales } from '../utils/dinero.js';
import { redondearCantidad } from '../utils/cantidad.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * HU-10 · CU-PRO-02 — la producción que registra ms-catalogo al finalizar una
 * orden llega aquí con el evento OrdenFinalizada.
 *
 * RF-PRO-07: la nota de egreso de los insumos, la de ingreso del producto
 * terminado y los dos stocks se registran en **una sola transacción**, junto con
 * la reserva que pasa a Consumida. Se reutilizan los mismos caminos de una nota
 * manual (`registrarEnTransaccion`), así que valen sus reglas: existencias por
 * almacén, lotes que vencen antes primero (FEFO), conservación del destino.
 *
 * Después se avisa ProduccionRegistrada con los números de nota y el costo real,
 * para que la orden los muestre.
 */
const esquema = z.object({
  idOrden: z.number().int().positive(),
  idReserva: z.string().min(1).max(60),
  idProducto: z.number().int().positive(),
  cantidadObtenida: z.number().int().min(0),
  empleado: z.object({ id: z.number().int().positive(), nombre: z.string().min(1), apellido: z.string().min(1) }),
});

/** Reparte lo reservado de cada insumo entre los almacenes con stock, del que más tiene al que menos. */
async function repartirEntreAlmacenes(tx: ClientePrisma, reserva: ReservaCompleta): Promise<LineaConsolidada[]> {
  const lineas: LineaConsolidada[] = [];
  for (const d of reserva.detalle_reserva_insumo) {
    let restante = Number(d.cantidad);
    for (const e of await reservaModel.existenciasPorAlmacen(tx, d.id_ingrediente)) {
      if (restante <= 1e-9) break;
      const toma = redondearCantidad(Math.min(restante, e.stock));
      if (toma > 0) lineas.push({ idItem: d.id_ingrediente, idAlmacen: e.idAlmacen, cantidad: toma, costoUnitario: 0 });
      restante = redondearCantidad(restante - toma);
    }
    if (restante > 1e-9) {
      // No debería pasar: lo reservado no se puede sacar por otro lado (HU-17).
      throw new ErrorApp(409, `No alcanza ${d.ingrediente.nombre} en los almacenes para la orden`);
    }
  }
  return lineas;
}

export async function ordenFinalizada(evento: Evento): Promise<void> {
  const d = esquema.parse(evento.datos);
  // La nota lleva quién finalizó la orden (réplica del empleado, RNF-ARQ-02).
  await empleadoModel.guardar(d.empleado.id, d.empleado.nombre, d.empleado.apellido);

  const resultado = await prisma.$transaction(
    async (tx: ClientePrisma) => {
      const reserva = await reservaService.consumirEnTransaccion(tx, d.idReserva);
      // Ya se registró: el evento llegó dos veces.
      if (!reserva) return null;

      const idNotaEgreso = await egresoService.registrarEnTransaccion(tx, {
        motivo: 'Produccion',
        observacion: `Orden de producción #${d.idOrden}`,
        insumos: await repartirEntreAlmacenes(tx, reserva),
        productos: [],
        idEmpleado: d.empleado.id,
      });

      // El costo real: lo consumido al costo vigente de cada insumo.
      const costoTotal = dosDecimales(
        reserva.detalle_reserva_insumo.reduce(
          (t, l) => t + dosDecimales(Number(l.cantidad) * Number(l.ingrediente.costo_unitario)),
          0,
        ),
      );

      let idNotaIngreso: number | null = null;
      if (d.cantidadObtenida > 0) {
        if (!reserva.id_almacen_destino) throw new ErrorApp(409, 'La reserva no dice a qué almacén entra el producto');
        idNotaIngreso = await ingresoService.registrarEnTransaccion(tx, {
          motivo: 'Produccion',
          proveedor: null,
          numeroDocumento: `Orden ${d.idOrden}`,
          insumos: [],
          productos: [
            {
              idItem: d.idProducto,
              idAlmacen: reserva.id_almacen_destino,
              cantidad: d.cantidadObtenida,
              // El costo se reparte entre lo obtenido, no entre lo planificado.
              costoUnitario: dosDecimales(costoTotal / d.cantidadObtenida),
            },
          ],
          idEmpleado: d.empleado.id,
        });
      }
      return { idNotaEgreso, idNotaIngreso, costoTotal };
    },
    { timeout: 15000 },
  );

  if (resultado) await avisar('ProduccionRegistrada', { idOrden: d.idOrden, ...resultado });
}
