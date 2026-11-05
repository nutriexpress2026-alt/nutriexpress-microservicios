import { Router } from 'express';
import productoRoutes from './producto.routes.js';
import catalogoRoutes from './catalogo.routes.js';
import negocioRoutes from './negocio.routes.js';
import recetaRoutes from './receta.routes.js';
import ordenRoutes from './orden.routes.js';

/**
 * Rutas de ms-catalogo: el API Gateway envía aquí /api/productos, /api/catalogo,
 * /api/negocio, /api/recetas y /api/ordenes.
 */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ estado: 'ok', servicio: 'ms-catalogo' });
});

router.use('/productos', productoRoutes);
router.use('/catalogo', catalogoRoutes);
router.use('/negocio', negocioRoutes);
router.use('/recetas', recetaRoutes);
router.use('/ordenes', ordenRoutes);

export default router;
