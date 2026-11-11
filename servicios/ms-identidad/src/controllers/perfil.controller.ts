import * as authService from '../services/auth.service.js';
import type { Request, Response } from 'express';
import * as perfilService from '../services/perfil.service.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';

/**
 * Autoservicio de la cuenta propia.
 *
 * Ninguna operación recibe el identificador por la URL: siempre sale de la
 * sesión. Es lo que hace imposible editar la cuenta de otro cambiando un
 * número en la dirección.
 */

export async function obtener(req: Request, res: Response) {
  res.json(await perfilService.obtener(idUsuarioDeSesion(req)));
}

export async function actualizar(req: Request, res: Response) {
  res.json(await perfilService.actualizar(idUsuarioDeSesion(req), req.body));
}

export async function cambiarContrasena(req: Request, res: Response) {
  const idUsuario = idUsuarioDeSesion(req);
  await perfilService.cambiarContrasena(idUsuario, req.body);
  // HU-07 · Las demás sesiones se cerraron: este navegador recibe una nueva.
  res.json(await authService.sesionNueva(idUsuario));
}

/** HU-33 · Tema y modo del usuario. */
export async function cambiarApariencia(req: Request, res: Response) {
  res.json(await perfilService.cambiarApariencia(idUsuarioDeSesion(req), req.body));
}

export async function actualizarPreferencias(req: Request, res: Response) {
  res.json(await perfilService.actualizarPreferencias(idUsuarioDeSesion(req), req.body));
}
