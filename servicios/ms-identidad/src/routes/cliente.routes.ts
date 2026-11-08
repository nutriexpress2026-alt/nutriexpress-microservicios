import { Router, type Request, type Response } from 'express';
import * as clienteService from '../services/cliente.service.js';
import { esquemaActualizarCliente, esquemaFiltroClientes } from '../dtos/cliente.dto.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import { ErrorApp } from '../errors/error-app.js';

/** HU-20 · Gestionar clientes (RF-VEN-01): el personal de ventas consulta y corrige las fichas. */
const router = Router();
router.use(requiereAutenticacion, requierePermiso('CLIENTE_GESTIONAR'));

router.get('/', async (req: Request, res: Response) => {
  const filtro = esquemaFiltroClientes.safeParse(req.query);
  if (!filtro.success) throw new ErrorApp(400, 'Filtro de clientes inválido');
  res.json(await clienteService.listar(idUsuarioDeSesion(req), filtro.data));
});

router.get('/:id', validarIdParam, async (req: Request, res: Response) => {
  res.json(await clienteService.obtener(idUsuarioDeSesion(req), Number(req.params.id)));
});

router.put('/:id', validarIdParam, validarCuerpo(esquemaActualizarCliente), async (req: Request, res: Response) => {
  res.json(await clienteService.actualizar(idUsuarioDeSesion(req), Number(req.params.id), req.body));
});

export default router;
