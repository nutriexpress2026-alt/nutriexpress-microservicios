import { Router } from 'express';
import * as ctrl from '../controllers/orden.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaCrearOrden, esquemaFinalizarOrden } from '../dtos/orden.dto.js';

/**
 * HU-10 · CU-PRO-02 Gestionar Orden de Producción y CU-PRO-04 Cancelarla.
 * Actores: Administrador y Empleado, con el permiso ORDEN_PRODUCCION_GESTIONAR.
 */
const router = Router();

router.use(requiereAutenticacion, requierePermiso('ORDEN_PRODUCCION_GESTIONAR'));

router.get('/', ctrl.listar);
// Antes de /:id, que la tomaría como un id.
router.get('/resumen', ctrl.resumen);
router.get('/:id', validarIdParam, ctrl.obtener);

router.post('/', validarCuerpo(esquemaCrearOrden), ctrl.crear);
router.post('/:id/iniciar', validarIdParam, ctrl.iniciar);
router.post('/:id/cancelar', validarIdParam, ctrl.cancelar);
router.post('/:id/finalizar', validarIdParam, validarCuerpo(esquemaFinalizarOrden), ctrl.finalizar);

export default router;
