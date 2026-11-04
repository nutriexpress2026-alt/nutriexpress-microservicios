import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { secretoPara } from './jwt.js';

/** Código de «olvidé mi contraseña» (HU-06): seis dígitos, al azar criptográfico. */
export function generarCodigo(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

const SECRETO = secretoPara('recuperacion-contrasena');

/**
 * Huella HMAC del código: es lo único que se guarda (64 caracteres hex). Lleva
 * el usuario dentro, para que el mismo código de dos cuentas no deje la misma
 * huella.
 */
export function huellaDeCodigo(idUsuario: number, codigo: string): string {
  return createHmac('sha256', SECRETO).update(`${idUsuario}:${codigo}`).digest('hex');
}

/** Compara dos huellas sin delatar, por el tiempo que tarda, en qué carácter difieren. */
export function mismaHuella(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}
