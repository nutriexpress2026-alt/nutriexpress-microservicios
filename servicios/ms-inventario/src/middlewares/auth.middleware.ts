import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ErrorApp } from '../errors/error-app.js';

/**
 * Autenticación en los microservicios que no son ms-identidad (RNF-SEG-02).
 *
 * El token lo firma ms-identidad con su clave privada (RS256). Aquí basta con
 * su clave pública para verificarlo: no se consulta a identidad en cada
 * petición ni se toca su base (RNF-ARQ-02). El token trae rol, cargo y
 * permisos, que es todo lo que estos servicios necesitan para autorizar.
 *
 * Copia idéntica en cada servicio (servicios/compartido/auth.middleware.ts).
 */
export interface Sesion {
  idUsuario: number;
  nombreUsuario: string;
  nombre: string;
  apellido: string;
  idRol: number;
  rol: string;
  cargo: string | null;
  permisos: string[];
  /** Cuándo se emitió el token (segundos): con él se rechazan los anteriores a un cambio de permisos. */
  iat?: number;
}

declare global {
  namespace Express {
    interface Request {
      sesion?: Sesion;
    }
  }
}

const URL_CLAVE = process.env.CLAVE_PUBLICA_URL ?? 'http://ms-identidad:4001/api/auth/clave-publica';
let clave: string | null = null;

/** La clave pública se pide una vez y se guarda; si identidad no responde, se reintenta en la próxima petición. */
async function clavePublica(): Promise<string> {
  if (clave) return clave;
  try {
    const r = await fetch(URL_CLAVE);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    clave = await r.text();
    return clave;
  } catch {
    throw new ErrorApp(503, 'No se puede verificar la sesión: el servicio de identidad no responde');
  }
}

/**
 * Acciones que el servicio quiere hacer con cada sesión válida; por ejemplo,
 * ms-inventario actualiza su réplica del empleado (id y nombre) con el token.
 */
export const alAutenticar: ((sesion: Sesion) => Promise<void>)[] = [];

export async function requiereAutenticacion(req: Request, _res: Response, next: NextFunction) {
  const cabecera = req.headers.authorization;
  if (!cabecera?.startsWith('Bearer ')) throw new ErrorApp(401, 'Token de sesión ausente');
  const pem = await clavePublica();
  try {
    req.sesion = jwt.verify(cabecera.slice(7), pem, { algorithms: ['RS256'], issuer: 'ms-identidad' }) as Sesion;
  } catch {
    throw new ErrorApp(401, 'Token de sesión inválido o expirado');
  }
  for (const accion of alAutenticar) await accion(req.sesion!);
  next();
}

export function requierePermiso(nombre: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.sesion) throw new ErrorApp(401, 'Sesión no iniciada');
    if (!req.sesion.permisos.includes(nombre)) throw new ErrorApp(403, `No tiene el permiso requerido: ${nombre}`);
    next();
  };
}

export function requiereAlgunPermiso(...nombres: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.sesion) throw new ErrorApp(401, 'Sesión no iniciada');
    if (!nombres.some((n) => req.sesion!.permisos.includes(n))) {
      throw new ErrorApp(403, `Necesita alguno de estos permisos: ${nombres.join(', ')}`);
    }
    next();
  };
}

/** Solo los empleados registran operaciones: el token dice si lo es (tiene cargo). */
export function exigirEmpleado(req: Request): Sesion {
  if (!req.sesion) throw new ErrorApp(401, 'Sesión no iniciada');
  if (!req.sesion.cargo) throw new ErrorApp(403, 'Solo el personal puede realizar esta operación');
  return req.sesion;
}

/** Para llamadas entre servicios dentro de la red de Docker (/interno), que el gateway no expone. */
export function soloRedInterna(req: Request, _res: Response, next: NextFunction) {
  if (req.headers['x-forwarded-for']) throw new ErrorApp(404, 'Ruta no encontrada');
  next();
}
