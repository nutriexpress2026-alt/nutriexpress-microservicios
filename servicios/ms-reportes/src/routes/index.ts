import { Router } from 'express';
import * as visita from '../controllers/visita.controller.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ estado: 'ok', servicio: 'ms-reportes' });
});

// Públicas: el contador se muestra a cualquier visitante (RF-WEB-03).
router.get('/visitas', visita.consultar);
router.post('/visitas', visita.registrar);

export default router;
