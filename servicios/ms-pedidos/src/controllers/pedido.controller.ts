import type { Request, Response } from 'express';
import * as pedidoService from '../services/pedido.service.js';
import * as ubicacionService from '../services/ubicacion.service.js';
import { ErrorApp } from '../errors/error-app.js';

/** Capa Controller — solo traduce HTTP; ninguna regla de negocio vive aquí. */

const id = (req: Request) => Number(req.params.id);

/* --- HU-21, HU-25 · Pedidos --- */

export async function confirmar(req: Request, res: Response) {
  res.status(201).json(await pedidoService.confirmar(req.sesion!, req.body));
}

export async function listar(req: Request, res: Response) {
  res.json(await pedidoService.listar(req.sesion!));
}

export async function detalle(req: Request, res: Response) {
  res.json(await pedidoService.detalle(req.sesion!, id(req)));
}

export async function cancelar(req: Request, res: Response) {
  res.json(await pedidoService.cancelar(req.sesion!, id(req)));
}

export async function seguimiento(req: Request, res: Response) {
  res.json(await pedidoService.seguimiento(req.sesion!, id(req)));
}

export async function comprobante(req: Request, res: Response) {
  res.json(await pedidoService.comprobante(req.sesion!, id(req)));
}

/** El PDF y el envío por correo del comprobante los hace ms-reportes (HU-32, Sprint 6). */
export function comprobanteEnSprint6() {
  throw new ErrorApp(503, 'El comprobante en PDF y por correo llega con el módulo de reportes (Sprint 6)');
}

/* --- HU-22 · Direcciones --- */

export async function listarUbicaciones(req: Request, res: Response) {
  res.json(await ubicacionService.listar(req.sesion!));
}

export async function crearUbicacion(req: Request, res: Response) {
  res.status(201).json(await ubicacionService.crear(req.sesion!, req.body));
}

export async function reemplazarUbicacion(req: Request, res: Response) {
  res.json(await ubicacionService.reemplazar(req.sesion!, id(req), req.body));
}

export async function marcarPrincipal(req: Request, res: Response) {
  res.json(await ubicacionService.marcarPrincipal(req.sesion!, id(req)));
}

export async function eliminarUbicacion(req: Request, res: Response) {
  await ubicacionService.eliminar(req.sesion!, id(req));
  res.status(204).end();
}
