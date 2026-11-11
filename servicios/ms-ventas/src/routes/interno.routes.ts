import { Router } from 'express';
import * as ventaModel from '../models/venta.model.js';
import { fotosParaReportes } from '../services/venta.service.js';
import { soloRedInterna } from '../middlewares/auth.middleware.js';

/**
 * Rutas internas: solo para otros microservicios dentro de la red de Docker.
 * Se montan fuera de /api, así que el API Gateway no las expone.
 */
const router = Router();
router.use(soloRedInterna);

/** HU-20 · Cuántas ventas tiene cada cliente (?clientes=1,2,3), para su ficha en ms-identidad. */
router.get('/ventas/conteo', async (req, res) => {
  const ids = String(req.query.clientes ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const filas = ids.length === 0 ? [] : await ventaModel.contarPorCliente(ids);
  res.json(Object.fromEntries(filas.map((f) => [f.id_cliente, f._count._all])));
});

/** HU-28 · La foto de todas las ventas: ms-reportes completa con ella su copia al arrancar. */
router.get('/ventas/reporte', async (_req, res) => {
  res.json(await fotosParaReportes());
});

export default router;
