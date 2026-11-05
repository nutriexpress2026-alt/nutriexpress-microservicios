import { Router } from 'express';
import * as ctrl from '../controllers/pago.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaCambiarModo } from '../dtos/pago.dto.js';

/** Rutas públicas de ms-pagos, detrás del API Gateway (/api/pagos y /api/configuracion). */
const router = Router();

/**
 * RF-PAG-02 · El aviso de la pasarela va **sin** autenticación: lo llama un
 * servidor ajeno que no tiene con qué iniciar sesión. Su defensa es la firma.
 * GET además de POST: Libélula devuelve al cliente a esta dirección.
 */
router.get('/pagos/notificacion', ctrl.recibirAviso);
router.post('/pagos/notificacion', ctrl.recibirAviso);

/* --- Cobros --- */
router.get('/pagos', requiereAutenticacion, requierePermiso('VENTA_LEER'), ctrl.listar);
router.post('/pagos/vencer', requiereAutenticacion, requierePermiso('VENTA_REGISTRAR'), ctrl.vencerPendientes);
/**
 * La consulta de un cobro no exige permiso de personal: el cliente que está
 * pagando su pedido tiene que poder ver si ya se acreditó. Sí exige sesión.
 */
router.get('/pagos/:id', requiereAutenticacion, validarIdParam, ctrl.obtener);
router.post(
  '/pagos/:id/confirmar',
  requiereAutenticacion,
  requierePermiso('VENTA_REGISTRAR'),
  validarIdParam,
  ctrl.confirmarManual,
);
router.post('/pagos/:id/anular', requiereAutenticacion, requierePermiso('VENTA_REGISTRAR'), validarIdParam, ctrl.anular);

/* --- HU-27 · Modo de cobro: solo el administrador --- */
router.get('/configuracion/cobro', requiereAutenticacion, requierePermiso('CONFIGURACION_GESTIONAR'), ctrl.estadoCobro);
router.put(
  '/configuracion/cobro',
  requiereAutenticacion,
  requierePermiso('CONFIGURACION_GESTIONAR'),
  validarCuerpo(esquemaCambiarModo),
  ctrl.cambiarModo,
);

export default router;
