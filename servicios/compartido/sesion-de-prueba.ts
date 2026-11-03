/**
 * Sesiones de prueba para los servicios que verifican el token de ms-identidad
 * (copia idéntica en tests/ de cada servicio).
 *
 * Genera un par de claves RS256, publica la pública en un servidor local (lo
 * que en producción hace /api/auth/clave-publica de ms-identidad) y firma
 * tokens con los permisos que cada prueba necesite. Así las pruebas no
 * dependen de que ms-identidad esté levantado.
 */
import { generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';

const PUERTO = 4999;
const par = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const URL_CLAVE = `http://127.0.0.1:${PUERTO}/clave-publica`;
process.env.CLAVE_PUBLICA_URL = URL_CLAVE;

const servidor = createServer((_req, res) => res.end(par.publicKey));
await new Promise<void>((ok) => servidor.listen(PUERTO, '127.0.0.1', ok));
export const cerrarServidorDeClave = () => new Promise((ok) => servidor.close(ok));

export interface DatosToken {
  idUsuario?: number;
  nombre?: string;
  apellido?: string;
  rol?: string;
  cargo?: string | null;
  permisos: string[];
}

export function token(d: DatosToken): string {
  return jwt.sign(
    {
      idUsuario: d.idUsuario ?? 1,
      nombreUsuario: 'prueba',
      nombre: d.nombre ?? 'Ana',
      apellido: d.apellido ?? 'Prueba',
      idRol: 1,
      rol: d.rol ?? 'Administrador',
      cargo: d.cargo === undefined ? 'Administrador' : d.cargo,
      permisos: d.permisos,
    },
    par.privateKey,
    { algorithm: 'RS256', issuer: 'ms-identidad', expiresIn: '1h' },
  );
}

export const cabecera = (d: DatosToken) => ({ Authorization: `Bearer ${token(d)}` });
