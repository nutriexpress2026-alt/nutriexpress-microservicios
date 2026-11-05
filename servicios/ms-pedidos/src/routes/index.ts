import { Router } from 'express';
import * as ctrl from '../controllers/pedido.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaConfirmarPedido } from '../dtos/pedido.dto.js';
import { esquemaCrearUbicacion } from '../dtos/ubicacion.dto.js';

/**
 * Rutas públicas de ms-pedidos, detrás del API Gateway. Conservan las del
 * sistema anterior (/api/pedidos, /api/ubicaciones) para que el portal
 * reutilizado funcione igual.
 */
const router = Router();
router.use(requiereAutenticacion);

/* --- HU-21, HU-25 · Pedidos del cliente --- */
router.post('/pedidos', requierePermiso('PEDIDO_GESTIONAR'), validarCuerpo(esquemaConfirmarPedido), ctrl.confirmar);
router.get('/pedidos', requierePermiso('PEDIDO_LEER'), ctrl.listar);
router.get('/pedidos/:id', requierePermiso('PEDIDO_LEER'), validarIdParam, ctrl.detalle);
router.post('/pedidos/:id/cancelar', requierePermiso('PEDIDO_GESTIONAR'), validarIdParam, ctrl.cancelar);
router.get('/pedidos/:id/seguimiento', requierePermiso('PEDIDO_LEER'), validarIdParam, ctrl.seguimiento);
router.get('/pedidos/:id/comprobante', requierePermiso('PEDIDO_LEER'), validarIdParam, ctrl.comprobante);
router.get('/pedidos/:id/comprobante.pdf', requierePermiso('PEDIDO_LEER'), ctrl.comprobanteEnSprint6);
router.post('/pedidos/:id/comprobante/enviar', requierePermiso('PEDIDO_LEER'), ctrl.comprobanteEnSprint6);

/*
 * --- HU-22 · Direcciones ---
 * Sin requierePermiso, como el perfil: administrar las direcciones propias no es
 * un privilegio que se conceda. El servicio exige que quien llama sea cliente.
 */
router.get('/ubicaciones', ctrl.listarUbicaciones);
router.post('/ubicaciones', validarCuerpo(esquemaCrearUbicacion), ctrl.crearUbicacion);
router.put('/ubicaciones/:id', validarIdParam, validarCuerpo(esquemaCrearUbicacion), ctrl.reemplazarUbicacion);
router.put('/ubicaciones/:id/principal', validarIdParam, ctrl.marcarPrincipal);
router.delete('/ubicaciones/:id', validarIdParam, ctrl.eliminarUbicacion);

export default router;
