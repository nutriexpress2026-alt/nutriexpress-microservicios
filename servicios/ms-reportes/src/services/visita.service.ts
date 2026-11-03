import * as visitaModel from '../models/visita.model.js';
import type { ContadorVisitasDTO } from '../dtos/visita.dto.js';

export async function registrar(ruta: string): Promise<ContadorVisitasDTO> {
  const doc = await visitaModel.sumar(ruta);
  return { ruta, total: doc.total, desde: doc.desde.toISOString() };
}

export async function consultar(ruta: string): Promise<ContadorVisitasDTO> {
  const doc = await visitaModel.buscar(ruta);
  return { ruta, total: doc?.total ?? 0, desde: doc?.desde.toISOString() ?? null };
}
