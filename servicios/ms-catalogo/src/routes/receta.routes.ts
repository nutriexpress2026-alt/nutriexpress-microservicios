import { Router } from 'express';
import * as ctrl from '../controllers/receta.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaReceta } from '../dtos/receta.dto.js';

/**
 * HU-09 · CU-PRO-01 — una versión de receta por su id. Listar y crear van por
 * el producto (`/productos/:id/recetas`). Gestionar recetas es parte de
 * gestionar productos: pide PRODUCTO_GESTIONAR.
 */
const gestiona = requierePermiso('PRODUCTO_GESTIONAR');
const router = Router();

router.use(requiereAutenticacion);

router.put('/:id', gestiona, validarIdParam, validarCuerpo(esquemaReceta), ctrl.actualizar);
router.post('/:id/activar', gestiona, validarIdParam, ctrl.activar);
router.delete('/:id', gestiona, validarIdParam, ctrl.eliminar);

export default router;
