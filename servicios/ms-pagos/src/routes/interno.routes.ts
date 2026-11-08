import { Router } from 'express';
import * as pagoService from '../services/pago.service.js';
import { esquemaEfectivo, esquemaSolicitudCobro } from '../dtos/pago.dto.js';
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

/** HU-18, HU-24 · El efectivo que ya se recibió (venta de mostrador o pedido entregado). */
router.post('/pagos/efectivo', validarCuerpo(esquemaEfectivo), async (req, res) => {
  res.status(201).json(await pagoService.registrarEfectivo(req.body));
});

/** El cobro de una venta, para que ms-ventas lo muestre (o null si no tiene). */
router.get('/pagos/venta/:id', async (req, res) => {
  res.json(await pagoService.deVenta(Number(req.params.id)));
});

/** HU-19 · La venta se anuló: su cobro se cierra (Fallido o Reembolsado). */
router.post('/pagos/venta/:id/anular', async (req, res) => {
  const detalle = typeof req.body?.detalle === 'string' ? req.body.detalle.slice(0, 300) : 'Venta anulada';
  res.json(await pagoService.cerrarPorAnulacionDeVenta(Number(req.params.id), detalle));
});

export default router;
