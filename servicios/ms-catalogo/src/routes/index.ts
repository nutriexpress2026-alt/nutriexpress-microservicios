import { Router } from 'express';
import productoRoutes from './producto.routes.js';
import catalogoRoutes from './catalogo.routes.js';
import negocioRoutes from './negocio.routes.js';
import recetaRoutes from './receta.routes.js';

/** Rutas de ms-catalogo: el API Gateway envía aquí /api/productos, /api/catalogo, /api/negocio y /api/recetas. */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ estado: 'ok', servicio: 'ms-catalogo' });
});

router.use('/productos', productoRoutes);
router.use('/catalogo', catalogoRoutes);
router.use('/negocio', negocioRoutes);
router.use('/recetas', recetaRoutes);

export default router;
