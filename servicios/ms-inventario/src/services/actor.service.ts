import * as empleadoModel from '../models/empleado.model.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * Las notas de inventario las registra el personal. El token dice si quien
 * opera es empleado (tiene cargo); al autenticarse se guarda en la réplica
 * local (ver app.ts). Si no está en ella, no es empleado.
 */
export async function exigirEmpleado(idUsuario: number, accion: string): Promise<number> {
  if (!(await empleadoModel.existe(idUsuario))) {
    throw new ErrorApp(403, `Solo el personal puede ${accion}`);
  }
  return idUsuario;
}
