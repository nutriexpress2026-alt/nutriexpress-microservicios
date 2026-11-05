import { Router } from 'express';
import * as pagoService from '../services/pago.service.js';
import { esquemaSolicitudCobro } from '../dtos/pago.dto.js';
import { validarCuerpo } from '../middlewares/validate.middleware.js';
import { soloRedInterna } from '../middlewares/auth.middleware.js';

/**
 * Rutas internas: solo para otros microservicios dentro de la red de Docker.
 * Se montan fuera de /api, así que el API Gateway no las expone.
 */
const router = Router();
router.use(soloRedInterna);

/** HU-26 · ms-pedidos abre el cobro del pedido recién confirmado (necesita el QR en el momento). */
router.post('/pagos', validarCuerpo(esquemaSolicitudCobro), async (req, res) => {
  res.status(201).json(await pagoService.crearYAbrir(req.body));
});

/** El cobro de un pedido, para que ms-pedidos lo muestre con el pedido (o null si no tiene). */
router.get('/pagos/pedido/:id', async (req, res) => {
  res.json(await pagoService.dePedido(Number(req.params.id)));
});

export default router;
