import { Router } from 'express';
import * as productoModel from '../models/producto.model.js';
import * as insumoModel from '../models/insumo.model.js';
import * as reservaService from '../services/reserva.service.js';
import * as reservaModel from '../models/reserva.model.js';
import { validarCuerpo } from '../middlewares/validate.middleware.js';
import { esquemaReserva, esquemaVerificar } from '../dtos/reserva.dto.js';
import { soloRedInterna } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';
import * as salidaService from '../services/salida.service.js';
import { z } from 'zod';

const esquemaEmpleado = z.object({ id: z.number().int().positive(), nombre: z.string().min(1), apellido: z.string().min(1) });
const esquemaConsumir = z.object({ observacion: z.string().trim().min(1).max(200), empleado: esquemaEmpleado });
const esquemaDevolver = z.object({
  referencia: z.string().trim().min(1).max(100),
  lineas: z
    .array(z.object({ idProducto: z.number().int().positive(), idAlmacen: z.number().int().positive(), cantidad: z.number().int().positive() }))
    .min(1),
  empleado: esquemaEmpleado,
});

/**
 * Rutas internas para ms-catalogo, dentro de la red de Docker. Se montan fuera
 * de /api, así que el API Gateway no las expone (RNF-ARQ-04).
 *
 * Que un producto se creó o cambió ya no llega por aquí sino con el evento
 * ProductoGuardado (HT-03, `services/replica.service.ts`).
 */
const router = Router();
router.use(soloRedInterna);

/** ms-catalogo quiere eliminar un producto: solo si aquí no tiene existencias ni movimientos. */
router.delete('/productos/:id', async (req, res) => {
  const id = Number(req.params.id);
  if ((await productoModel.contarUsos(id)) > 0) {
    throw new ErrorApp(409, 'El producto registra existencias o movimientos de inventario');
  }
  await productoModel.quitarReplica(id);
  res.status(204).end();
});

/** Existencias por almacén y costo promedio de los productos pedidos (?ids=1,2,3). */
router.get('/productos/existencias', async (req, res) => {
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const [filas, costos, reservado] = await Promise.all([
    productoModel.existenciasDe(ids),
    productoModel.costosPromedio(ids),
    reservaModel.reservadoDeProductos(ids),
  ]);
  res.json(
    ids.map((id) => {
      const existencias = filas
        .filter((f) => f.id_producto === id)
        .map((f) => ({ idAlmacen: f.almacen.id_almacen, almacen: f.almacen.nombre, stock: f.stock_actual }));
      return {
        idProducto: id,
        stockTotal: existencias.reduce((t, e) => t + e.stock, 0),
        // HU-21: lo apartado para pedidos que todavía no se entregaron.
        reservado: reservado.get(id) ?? 0,
        existencias,
        costoPromedio: costos.get(id) ?? null,
      };
    }),
  );
});

/*
 * HU-17 · Reservas de stock para otros servicios (ms-catalogo al producir; ms-pedidos
 * desde el Sprint 4). Verificar no reserva. Repetir una reserva con el mismo id
 * devuelve la que ya existía (200) en vez de descontar otra vez (201).
 */
router.post('/reservas/verificar', validarCuerpo(esquemaVerificar), async (req, res) => {
  res.json(await reservaService.verificar(req.body));
});

router.post('/reservas', validarCuerpo(esquemaReserva), async (req, res) => {
  const { reserva, nueva } = await reservaService.reservar(req.body);
  res.status(nueva ? 201 : 200).json(reserva);
});

router.get('/reservas/:id', async (req, res) => {
  res.json(await reservaService.obtener(String(req.params.id)));
});

/**
 * HU-18, HU-24 · Una venta de mostrador o un pedido entregado consume su reserva:
 * nota de egreso con motivo Venta. Repetirlo no descuenta dos veces.
 */
router.post('/reservas/:id/consumir', validarCuerpo(esquemaConsumir), async (req, res) => {
  res.json(await salidaService.consumirParaVenta(String(req.params.id), req.body));
});

/** HU-19 · Una venta anulada devuelve sus productos a los almacenes de los que salieron. */
router.post('/devoluciones', validarCuerpo(esquemaDevolver), async (req, res) => {
  res.status(201).json(await salidaService.devolver(req.body));
});

router.post('/reservas/:id/liberar', async (req, res) => {
  res.json(await reservaService.liberar(String(req.params.id)));
});

/** HU-09 · Todos los insumos, para que ms-catalogo reconstruya su réplica al arrancar. */
router.get('/insumos', async (_req, res) => {
  res.json(await insumoModel.paraReplica());
});

export default router;
