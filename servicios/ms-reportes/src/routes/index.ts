import { Router } from 'express';
import * as visita from '../controllers/visita.controller.js';
import reportes from './reporte.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ estado: 'ok', servicio: 'ms-reportes' });
});

// Públicas: el contador se muestra a cualquier visitante (RF-WEB-03).
router.get('/visitas', visita.consultar);
router.post('/visitas', visita.registrar);

// HU-28, HU-29 (Sprint 6) · Reportes de ventas y de pedidos.
router.use('/reportes', reportes);

export default router;
