import { Router } from 'express';
import almacenRoutes from './almacen.routes.js';
import insumoRoutes from './insumo.routes.js';
import { ingresos, egresos, stock } from './inventario.routes.js';

/** Rutas de ms-inventario: el API Gateway envía aquí /api/almacenes, /api/insumos, /api/ingresos, /api/egresos y /api/stock. */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ estado: 'ok', servicio: 'ms-inventario' });
});

router.use('/almacenes', almacenRoutes);
router.use('/insumos', insumoRoutes);
router.use('/ingresos', ingresos);
router.use('/egresos', egresos);
router.use('/stock', stock);

export default router;
