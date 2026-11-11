import { Router, type Request, type Response } from 'express';
import type { z } from 'zod';
import { requiereAutenticacion, requierePermiso, exigirEmpleado } from '../middlewares/auth.middleware.js';
import { esquemaDestinatarios, esquemaReportePedidos, esquemaReporteVentas } from '../dtos/reporte.dto.js';
import { ErrorApp } from '../errors/error-app.js';
import * as proyeccion from '../models/proyeccion.model.js';
import * as reporteService from '../services/reporte.service.js';

/**
 * HU-28 y HU-29 · Reportes de ventas y de pedidos: consultar, descargar en PDF
 * y enviar por correo. Son las rutas del sistema anterior (`/api/reportes/...`),
 * que el frontend reutilizado ya llama.
 *
 * Cada reporte exige el permiso de lectura de su módulo y que sea personal: un
 * cliente tiene PEDIDO_LEER (sus propios pedidos) pero no ve los del negocio.
 */
const router = Router();
router.use(requiereAutenticacion);

function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.infer<T> {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    throw new ErrorApp(400, `Datos inválidos. ${r.error.issues.map((i) => `${i.path.join('.') || 'filtro'}: ${i.message}`).join('; ')}`);
  }
  return r.data;
}

function montar(nombre: reporteService.NombreReporte, permiso: string, esquema: typeof esquemaReporteVentas | typeof esquemaReportePedidos) {
  const consultar = nombre === 'ventas' ? reporteService.ventas : reporteService.pedidos;

  router.get(`/${nombre}`, requierePermiso(permiso), async (req: Request, res: Response) => {
    exigirEmpleado(req);
    res.json(await (consultar as (f: unknown) => Promise<unknown>)(validar(esquema, req.query)));
  });

  router.get(`/${nombre}.pdf`, requierePermiso(permiso), async (req: Request, res: Response) => {
    exigirEmpleado(req);
    const { pdf, archivo } = await reporteService.pdf(nombre, validar(esquema, req.query));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);
    res.send(pdf);
  });

  router.post(`/${nombre}/enviar`, requierePermiso(permiso), async (req: Request, res: Response) => {
    exigirEmpleado(req);
    const { para } = validar(esquemaDestinatarios, req.body);
    // El filtro viaja en el cuerpo (como en el sistema anterior) o en la consulta.
    const filtro = validar(esquema, { ...req.query, ...req.body });
    res.json(await reporteService.enviar(nombre, filtro, para));
  });
}

/** Los vendedores que vendieron alguna vez: el filtro «por vendedor» de HU-28. */
router.get('/ventas/vendedores', requierePermiso('VENTA_LEER'), async (req: Request, res: Response) => {
  exigirEmpleado(req);
  res.json(await proyeccion.vendedores());
});

montar('ventas', 'VENTA_LEER', esquemaReporteVentas);
montar('pedidos', 'PEDIDO_LEER', esquemaReportePedidos);

export default router;
