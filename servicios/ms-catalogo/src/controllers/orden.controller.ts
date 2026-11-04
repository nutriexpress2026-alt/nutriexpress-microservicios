import type { Request, Response } from 'express';
import * as ordenService from '../services/orden.service.js';
import { esquemaFiltroOrdenes } from '../dtos/orden.dto.js';
import { exigirEmpleado } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';

/** HU-10 · CU-PRO-02 y CU-PRO-04 — órdenes de producción. */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroOrdenes.safeParse(req.query);
  if (!filtro.success) throw new ErrorApp(400, 'Filtro de órdenes inválido');
  res.json(await ordenService.listar(filtro.data));
}

export async function resumen(_req: Request, res: Response) {
  res.json(await ordenService.resumen());
}

export async function obtener(req: Request, res: Response) {
  res.json(await ordenService.obtener(Number(req.params.id)));
}

/** La registra el personal: el token dice quién (queda en la orden). */
export async function crear(req: Request, res: Response) {
  res.status(201).json(await ordenService.crear(exigirEmpleado(req), req.body));
}

export async function iniciar(req: Request, res: Response) {
  res.json(await ordenService.iniciar(Number(req.params.id)));
}

export async function cancelar(req: Request, res: Response) {
  res.json(await ordenService.cancelar(Number(req.params.id)));
}

export async function finalizar(req: Request, res: Response) {
  res.json(await ordenService.finalizar(Number(req.params.id), exigirEmpleado(req), req.body));
}
