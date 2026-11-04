import { ErrorApp } from '../errors/error-app.js';
import type { Evento } from '../config/eventos.js';
import type { Sesion } from './auth.middleware.js';

/**
 * HU-05 · «El cambio rige en la siguiente petición», también fuera de
 * ms-identidad (T6.1).
 *
 * Copia idéntica en `src/middlewares/sesiones-vigentes.ts` de cada servicio que
 * verifica los tokens de ms-identidad (servicios/compartido/sesiones-vigentes.ts).
 *
 * El token trae los permisos del momento en que se emitió y dura horas. Cuando
 * cambian los de un usuario —o los de un rol, o la cuenta se da de baja—,
 * ms-identidad publica `PermisosCambiados`, y aquí se anota **desde cuándo**
 * valen las sesiones de ese usuario o rol. Un token emitido antes se rechaza
 * con 401; el frontend pide entonces iniciar sesión otra vez, y el token nuevo
 * trae los permisos de ahora.
 *
 * Lo anotado se guarda en la base del servicio (sobrevive a un reinicio) y en
 * cada petición se consulta en memoria, sin ir a la base.
 */
export interface DatosPermisosCambiados {
  idUsuario?: number;
  idRol?: number;
  /** Desde cuándo valen las sesiones (ISO 8601). */
  desde: string;
}

/** Dónde guarda el servicio esas fechas, en su propia base (RNF-ARQ-02). */
export interface AlmacenDeVigencias {
  todas(): Promise<{ clave: string; desde: Date }[]>;
  /** Guarda la fecha solo si es posterior a la que ya había. */
  guardar(clave: string, desde: Date): Promise<void>;
}

const vigentesDesde = new Map<string, number>();
let almacen: AlmacenDeVigencias | null = null;
let carga: Promise<void> = Promise.resolve();

const claveUsuario = (id: number) => `usuario:${id}`;
const claveRol = (id: number) => `rol:${id}`;

function anotar(clave: string, ms: number) {
  if (ms > (vigentesDesde.get(clave) ?? 0)) vigentesDesde.set(clave, ms);
}

/** Al arrancar: trae de la base lo anotado antes de un reinicio. */
export function usarAlmacenDeVigencias(nuevo: AlmacenDeVigencias): Promise<void> {
  almacen = nuevo;
  carga = nuevo
    .todas()
    .then((filas) => filas.forEach((f) => anotar(f.clave, f.desde.getTime())))
    // Sin base al arrancar, las peticiones no se traban: se sigue con lo que llegue por eventos.
    .catch((e: unknown) => console.error(`sesiones: no se pudieron cargar las vigencias (${(e as Error).message})`));
  return carga;
}

/** Manejador de `PermisosCambiados`. */
export async function permisosCambiados(evento: Evento<DatosPermisosCambiados>): Promise<void> {
  const { idUsuario, idRol, desde } = evento.datos;
  const ms = Date.parse(desde);
  const claves = [
    ...(Number.isInteger(idUsuario) ? [claveUsuario(idUsuario!)] : []),
    ...(Number.isInteger(idRol) ? [claveRol(idRol!)] : []),
  ];
  if (Number.isNaN(ms) || claves.length === 0) throw new Error('PermisosCambiados sin usuario ni rol, o sin fecha');
  for (const clave of claves) {
    if (almacen) await almacen.guardar(clave, new Date(ms));
    anotar(clave, ms);
  }
}

/**
 * Gancho de `alAutenticar`: rechaza el token emitido antes del último cambio
 * de permisos de su usuario o de su rol.
 */
export async function exigirSesionVigente(sesion: Sesion): Promise<void> {
  await carga;
  const emitido = (sesion.iat ?? 0) * 1000;
  const desde = Math.max(
    vigentesDesde.get(claveUsuario(sesion.idUsuario)) ?? 0,
    vigentesDesde.get(claveRol(sesion.idRol)) ?? 0,
  );
  if (emitido < desde) throw new ErrorApp(401, 'Sus permisos cambiaron: vuelva a iniciar sesión.');
}
