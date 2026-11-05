import { ROL_CLIENTE } from '../config/dominio.js';
import type { Sesion } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * Quién es el cliente, según su token (RNF-ARQ-02: ms-pedidos no lee la base de
 * ms-identidad). Solo un cliente tiene direcciones y pedidos propios; el
 * personal ve los pedidos desde su tablero (HU-23, Sprint 5).
 */
export function exigirCliente(sesion: Sesion, para: string): { id: number; nombre: string } {
  if (sesion.rol !== ROL_CLIENTE) throw new ErrorApp(403, `Solo un cliente puede ${para}`);
  return { id: sesion.idUsuario, nombre: `${sesion.nombre} ${sesion.apellido}`.trim() };
}
