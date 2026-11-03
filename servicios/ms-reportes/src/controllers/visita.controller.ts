import type { Request, Response } from 'express';
import * as visitaService from '../services/visita.service.js';
import { esquemaRuta } from '../dtos/visita.dto.js';
import { ErrorApp } from '../errors/error-app.js';

function rutaDe(datos: unknown): string {
  const r = esquemaRuta.safeParse(datos ?? {});
  if (!r.success) throw new ErrorApp(400, 'Indique la ruta de la página, por ejemplo "/portal"');
  return r.data.ruta;
}

/** GET /api/visitas?ruta=/portal — consulta sin sumar. */
export async function consultar(req: Request, res: Response) {
  res.json(await visitaService.consultar(rutaDe(req.query)));
}

/** POST /api/visitas { ruta } — suma una visita a esa página y devuelve su total. */
export async function registrar(req: Request, res: Response) {
  res.status(201).json(await visitaService.registrar(rutaDe(req.body)));
}
