import { Router } from 'express';
import { z } from 'zod';
import * as productoModel from '../models/producto.model.js';
import { soloRedInterna } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';
import { TIPOS_CONSERVACION } from '../config/dominio.js';

/**
 * Rutas internas para ms-catalogo, dentro de la red de Docker. Se montan fuera
 * de /api, así que el API Gateway no las expone (RNF-ARQ-04).
 */
const router = Router();
router.use(soloRedInterna);

const esquemaReplica = z.object({
  nombre: z.string().min(1).max(100),
  tipoConservacion: z.enum(TIPOS_CONSERVACION),
  activo: z.boolean(),
});

/** ms-catalogo avisa que se creó o cambió un producto. */
router.put('/productos/:id', async (req, res) => {
  const id = Number(req.params.id);
  const datos = esquemaReplica.parse(req.body);
  await productoModel.guardarReplica({ id, ...datos });
  res.status(204).end();
});

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

export default router;
