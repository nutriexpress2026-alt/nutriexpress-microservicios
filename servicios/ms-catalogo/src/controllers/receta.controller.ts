import type { Request, Response } from 'express';
import * as recetaService from '../services/receta.service.js';
import type { DatosReceta } from '../dtos/receta.dto.js';

/** HU-09 · CU-PRO-01 — versiones de receta de un producto. */

export async function listarDeProducto(req: Request, res: Response) {
  res.json(await recetaService.listarDeProducto(Number(req.params.id)));
}

export async function crear(req: Request, res: Response) {
  res.status(201).json(await recetaService.crear(Number(req.params.id), req.body as DatosReceta));
}

export async function actualizar(req: Request, res: Response) {
  res.json(await recetaService.actualizar(Number(req.params.id), req.body as DatosReceta));
}

export async function activar(req: Request, res: Response) {
  res.json(await recetaService.activar(Number(req.params.id)));
}

export async function eliminar(req: Request, res: Response) {
  await recetaService.eliminar(Number(req.params.id));
  res.status(204).end();
}
