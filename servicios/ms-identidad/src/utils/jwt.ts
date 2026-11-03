import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../config/env.js';

/**
 * Contenido del token de sesión (RNF-SEG-02).
 *
 * Lleva el rol, el cargo y los permisos para que los demás microservicios
 * autoricen sin consultar a ms-identidad en cada petición: les basta con
 * verificar la firma con la clave pública. ms-identidad, que es el dueño de
 * los datos, además vuelve a mirar la base en cada petición (auth.middleware).
 */
export interface PayloadToken {
  idUsuario: number;
  nombreUsuario: string;
  /** Nombre y apellido: los demás servicios lo guardan en sus réplicas (quién registró qué). */
  nombre: string;
  apellido: string;
  idRol: number;
  rol: string;
  cargo: string | null;
  permisos: string[];
}

/**
 * Par de claves RS256: la privada firma y solo la tiene este servicio; la
 * pública verifica y se publica en GET /api/auth/clave-publica. Se crea la
 * primera vez que arranca el servicio y se guarda en un volumen.
 */
function cargarClaves(): { privada: string; publica: string } {
  const rutaPrivada = join(env.clavesDir, 'privada.pem');
  const rutaPublica = join(env.clavesDir, 'publica.pem');
  if (!existsSync(rutaPrivada) || !existsSync(rutaPublica)) {
    const par = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    mkdirSync(env.clavesDir, { recursive: true });
    writeFileSync(rutaPrivada, par.privateKey, { mode: 0o600 });
    writeFileSync(rutaPublica, par.publicKey);
  }
  return { privada: readFileSync(rutaPrivada, 'utf8'), publica: readFileSync(rutaPublica, 'utf8') };
}

const claves = cargarClaves();
export const clavePublica = claves.publica;
const EMISOR = 'ms-identidad';

export function firmarToken(payload: PayloadToken): string {
  return jwt.sign(payload, claves.privada, {
    algorithm: 'RS256',
    issuer: EMISOR,
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function verificarToken(token: string): PayloadToken {
  return jwt.verify(token, claves.publica, { algorithms: ['RS256'], issuer: EMISOR }) as PayloadToken;
}
