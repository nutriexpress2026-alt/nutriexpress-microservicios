import { Router, type Request, type Response } from 'express';
import * as ventaService from '../services/venta.service.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaAnularVenta, esquemaCrearVenta, esquemaEvaluarVenta, esquemaFiltroVentas } from '../dtos/venta.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/** HU-18, HU-19 · Rutas de ms-ventas (/api/ventas), las del sistema anterior que usa el punto de venta. */
const router = Router();
router.use(requiereAutenticacion);

const id = (req: Request) => Number(req.params.id);

router.get('/ventas', requierePermiso('VENTA_LEER'), async (req: Request, res: Response) => {
  const filtro = esquemaFiltroVentas.safeParse(req.query);
  if (!filtro.success) throw new ErrorApp(400, 'Filtro de ventas inválido');
  res.json(await ventaService.listar(req.sesion!, filtro.data));
});
router.post('/ventas', requierePermiso('VENTA_REGISTRAR'), validarCuerpo(esquemaCrearVenta), async (req: Request, res: Response) => {
  res.status(201).json(await ventaService.crear(req.sesion!, req.body));
});
router.post('/ventas/evaluacion', requierePermiso('VENTA_REGISTRAR'), validarCuerpo(esquemaEvaluarVenta), async (req: Request, res: Response) => {
  res.json(await ventaService.evaluar(req.sesion!, req.body.items));
});
/** La «producción al instante» del sistema anterior no se incluye: sin stock, la venta no se confirma (RF-VEN-05). */
router.post('/ventas/con-produccion', requierePermiso('VENTA_REGISTRAR'), () => {
  throw new ErrorApp(409, 'No hay stock suficiente: registre primero la orden de producción (Producción › Órdenes) y después la venta');
});
router.get('/ventas/:id', requierePermiso('VENTA_LEER'), validarIdParam, async (req: Request, res: Response) => {
  res.json(await ventaService.obtener(req.sesion!, id(req)));
});
router.get('/ventas/:id/comprobante', requierePermiso('VENTA_LEER'), validarIdParam, async (req: Request, res: Response) => {
  res.json(await ventaService.comprobante(req.sesion!, id(req)));
});
router.post(
  '/ventas/:id/anular',
  requierePermiso('VENTA_REGISTRAR'),
  validarIdParam,
  validarCuerpo(esquemaAnularVenta),
  async (req: Request, res: Response) => {
    res.json(await ventaService.anular(req.sesion!, id(req), req.body.motivo));
  },
);

export default router;
