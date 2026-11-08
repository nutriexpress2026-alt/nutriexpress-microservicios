import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import * as gestion from '../services/gestion.service.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { camposDeFecha, camposDePagina } from '../dtos/paginacion.dto.js';
import { coordenada } from '../dtos/ubicacion.dto.js';
import { ESTADOS_PEDIDO } from '../config/dominio.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * HU-23 · Tablero de pedidos y HU-24 · Mis entregas (/api/gestion), con las rutas
 * del sistema anterior que usa el frontend reutilizado.
 */
const esquemaFiltro = z.object({ estado: z.enum(ESTADOS_PEDIDO).optional(), ...camposDeFecha, ...camposDePagina });
const esquemaFechas = z.object(camposDeFecha);
/** El esquema acepta cualquier estado; que la transición sea legítima lo decide el flujo (409). */
const esquemaEstado = z.object({ estado: z.enum(ESTADOS_PEDIDO) });
const esquemaRepartidor = z.object({ idRepartidor: z.number().int().positive() });
const esquemaDisponibilidad = z.object({ disponible: z.boolean() });
const esquemaPosicion = z.object({
  latitud: coordenada(90),
  longitud: coordenada(180),
  precision: z
    .number()
    .min(0)
    .max(1_000_000)
    .transform((v) => Math.round(v * 10) / 10)
    .nullable()
    .optional(),
});

function consulta<T>(esquema: z.ZodType<T>, req: Request): T {
  const r = esquema.safeParse(req.query);
  if (!r.success) throw new ErrorApp(400, 'Filtro inválido');
  return r.data;
}

const id = (req: Request) => Number(req.params.id);
const router = Router();
router.use(requiereAutenticacion);

router.get('/repartidores', requierePermiso('PEDIDO_LEER'), async (req: Request, res: Response) => {
  res.json(await gestion.listarRepartidores(req.sesion!));
});

/* --- HU-24 · El repartidor: su turno, sus entregas y su posición --- */
router.get('/disponibilidad', async (req: Request, res: Response) => {
  res.json(await gestion.consultarDisponibilidad(req.sesion!));
});
router.put('/disponibilidad', validarCuerpo(esquemaDisponibilidad), async (req: Request, res: Response) => {
  res.json(await gestion.cambiarDisponibilidad(req.sesion!, req.body.disponible));
});
router.get('/mis-entregas', requierePermiso('PEDIDO_LEER'), async (req: Request, res: Response) => {
  res.json(await gestion.misEntregas(req.sesion!));
});
router.put('/mi-posicion', requierePermiso('PEDIDO_LEER'), validarCuerpo(esquemaPosicion), async (req: Request, res: Response) => {
  await gestion.informarPosicion(req.sesion!, req.body);
  res.status(204).end();
});
router.delete('/mi-posicion', requierePermiso('PEDIDO_LEER'), async (req: Request, res: Response) => {
  await gestion.dejarDeCompartir(req.sesion!);
  res.status(204).end();
});

/* --- HU-23 · El tablero --- */
router.get('/pedidos/resumen', requierePermiso('PEDIDO_LEER'), async (req: Request, res: Response) => {
  res.json(await gestion.resumen(req.sesion!, consulta(esquemaFechas, req)));
});
router.get('/pedidos', requierePermiso('PEDIDO_LEER'), async (req: Request, res: Response) => {
  res.json(await gestion.listar(req.sesion!, consulta(esquemaFiltro, req)));
});
router.get('/pedidos/:id', requierePermiso('PEDIDO_LEER'), validarIdParam, async (req: Request, res: Response) => {
  res.json(await gestion.detalle(req.sesion!, id(req)));
});
router.get('/pedidos/:id/seguimiento', requierePermiso('PEDIDO_LEER'), validarIdParam, async (req: Request, res: Response) => {
  res.json(await gestion.seguimiento(req.sesion!, id(req)));
});
router.patch(
  '/pedidos/:id/estado',
  requierePermiso('PEDIDO_GESTIONAR'),
  validarIdParam,
  validarCuerpo(esquemaEstado),
  async (req: Request, res: Response) => {
    res.json(await gestion.avanzarEstado(req.sesion!, id(req), req.body.estado));
  },
);
router.get('/pedidos/:id/sugerencia-repartidor', requierePermiso('PEDIDO_GESTIONAR'), validarIdParam, async (req: Request, res: Response) => {
  res.json(await gestion.sugerirRepartidor(req.sesion!, id(req)));
});
router.put(
  '/pedidos/:id/repartidor',
  requierePermiso('PEDIDO_GESTIONAR'),
  validarIdParam,
  validarCuerpo(esquemaRepartidor),
  async (req: Request, res: Response) => {
    res.json(await gestion.asignarRepartidor(req.sesion!, id(req), req.body.idRepartidor));
  },
);

export default router;
