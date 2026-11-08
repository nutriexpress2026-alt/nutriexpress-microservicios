import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usuarioRoutes from './usuario.routes.js';
import perfilRoutes from './perfil.routes.js';
import rolRoutes from './rol.routes.js';
import cargoRoutes from './cargo.routes.js';
import clienteRoutes from './cliente.routes.js';

/**
 * Rutas de ms-identidad. Conservan los caminos del sistema anterior (/api/auth,
 * /api/usuarios…): el API Gateway envía aquí todo lo que empieza así.
 */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ estado: 'ok', servicio: 'ms-identidad' });
});

router.use('/auth', authRoutes);
router.use('/usuarios', usuarioRoutes);
router.use('/perfil', perfilRoutes);
router.use('/roles', rolRoutes);
router.use('/cargos', cargoRoutes);
// HU-20 (Sprint 5): los datos del cliente son de ms-identidad desde el Sprint 1.
router.use('/clientes', clienteRoutes);

export default router;
