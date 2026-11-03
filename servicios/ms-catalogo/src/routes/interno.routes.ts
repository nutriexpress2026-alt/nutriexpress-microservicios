import { Router } from 'express';
import * as productoModel from '../models/producto.model.js';
import { soloRedInterna } from '../middlewares/auth.middleware.js';

/**
 * Rutas internas: solo para otros microservicios dentro de la red de Docker.
 * Se montan fuera de /api, así que el API Gateway no las expone.
 */
const router = Router();
router.use(soloRedInterna);

/** Todos los productos, para que ms-inventario reconstruya su réplica al arrancar. */
router.get('/productos', async (_req, res) => {
  const productos = await productoModel.paraReplica();
  res.json(
    productos.map((p) => ({
      id: p.id_producto,
      nombre: p.nombre,
      tipoConservacion: p.tipo_conservacion,
      activo: p.activo,
    })),
  );
});

export default router;
