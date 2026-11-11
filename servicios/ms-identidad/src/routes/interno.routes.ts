import { Router, type NextFunction, type Request, type Response } from 'express';
import * as empleadoModel from '../models/empleado.model.js';
import * as clienteModel from '../models/cliente.model.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * Rutas internas de ms-identidad: solo para otros microservicios dentro de la red
 * de Docker. Se montan fuera de /api, así que el API Gateway no las expone; lo que
 * llega con X-Forwarded-For vino por el gateway y se rechaza.
 */
const router = Router();
router.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.headers['x-forwarded-for']) throw new ErrorApp(404, 'Ruta no encontrada');
  next();
});

/** HU-23 · Los empleados con cargo Repartidor activos, para el tablero de ms-pedidos. */
router.get('/repartidores', async (_req, res) => {
  const repartidores = await empleadoModel.listarRepartidores();
  res.json(
    repartidores.map((r) => ({
      id: r.id_empleado,
      nombre: r.usuario.nombre,
      apellido: r.usuario.apellido,
      telefono: r.usuario.telefono,
    })),
  );
});

/** HU-23 · Un empleado con su cargo: «solo se asignan empleados con cargo Repartidor». */
router.get('/empleados/:id', async (req, res) => {
  const e = await empleadoModel.buscarPorId(Number(req.params.id));
  if (!e) throw new ErrorApp(404, 'El empleado no existe');
  res.json({ id: e.id_empleado, nombre: e.usuario.nombre, apellido: e.usuario.apellido, cargo: e.cargo.nombre, activo: e.usuario.activo });
});

/** HU-18 · Un cliente, para asociarlo a una venta de mostrador (ms-ventas). */
router.get('/clientes/:id', async (req, res) => {
  const c = await clienteModel.buscarDetalle(Number(req.params.id));
  if (!c) throw new ErrorApp(404, 'El cliente indicado no existe');
  // HU-32 · El correo lo usa ms-reportes para avisarle del estado de su pedido.
  res.json({
    id: c.id_cliente,
    nombreCompleto: `${c.usuario.nombre} ${c.usuario.apellido}`,
    email: c.usuario.email,
    activo: c.usuario.activo,
  });
});

export default router;
