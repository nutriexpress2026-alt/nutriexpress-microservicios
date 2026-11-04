import { Router } from 'express';
import * as productoModel from '../models/producto.model.js';
import * as insumoModel from '../models/insumo.model.js';
import * as reservaService from '../services/reserva.service.js';
import { validarCuerpo } from '../middlewares/validate.middleware.js';
import { esquemaReserva, esquemaVerificar } from '../dtos/reserva.dto.js';
import { soloRedInterna } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';

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
  const [filas, costos] = await Promise.all([productoModel.existenciasDe(ids), productoModel.costosPromedio(ids)]);
  res.json(
    ids.map((id) => {
      const existencias = filas
        .filter((f) => f.id_producto === id)
        .map((f) => ({ idAlmacen: f.almacen.id_almacen, almacen: f.almacen.nombre, stock: f.stock_actual }));
      return {
        idProducto: id,
        stockTotal: existencias.reduce((t, e) => t + e.stock, 0),
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

router.post('/reservas/:id/liberar', async (req, res) => {
  res.json(await reservaService.liberar(String(req.params.id)));
});

/** HU-09 · Todos los insumos, para que ms-catalogo reconstruya su réplica al arrancar. */
router.get('/insumos', async (_req, res) => {
  res.json(await insumoModel.paraReplica());
});

export default router;
