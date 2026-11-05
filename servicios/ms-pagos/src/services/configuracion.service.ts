import * as configModel from '../models/configuracion.model.js';
import { MODOS_COBRO, type ModoCobro } from '../config/dominio.js';
import { pasarelaPara, pasarelasRealesDisponibles } from '../pagos/index.js';
import type { Sesion } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * HU-27 · Modo de cobro: simulado o real, cambiado por el administrador.
 *
 * «El cambio rige sin reiniciar»: el modo se lee de la base, con una caché de
 * pocos segundos para no consultarla en cada cobro. «Cada pago conserva el modo
 * con que nació»: lo congela la columna `pago.modo` al crearse.
 */

export const CLAVE_MODO_COBRO = 'MODO_COBRO';
const MODO_POR_OMISION: ModoCobro = 'Simulado';
const VIGENCIA_CACHE_MS = 5_000;

let cache: { valor: ModoCobro; expira: number } | null = null;

export function invalidarCache(): void {
  cache = null;
}

export async function modoCobro(): Promise<ModoCobro> {
  if (cache && Date.now() < cache.expira) return cache.valor;
  const fila = await configModel.buscar(CLAVE_MODO_COBRO);
  const valor = esModoValido(fila?.valor) ? fila.valor : MODO_POR_OMISION;
  cache = { valor, expira: Date.now() + VIGENCIA_CACHE_MS };
  return valor;
}

function esModoValido(valor: string | undefined): valor is ModoCobro {
  return valor !== undefined && (MODOS_COBRO as readonly string[]).includes(valor);
}

export interface EstadoCobroDTO {
  modo: ModoCobro;
  pasarela: string;
  pasarelaReal: string;
  /** Falso cuando el modo es Real pero la pasarela no puede operar todavía. */
  operativa: boolean;
  advertencia?: string;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
  pasarelasDisponibles: string[];
}

export async function estadoCobro(): Promise<EstadoCobroDTO> {
  const modo = await modoCobro();
  const fila = await configModel.buscar(CLAVE_MODO_COBRO);

  let pasarela = 'Simulada';
  let operativa = true;
  let advertencia: string | undefined;
  try {
    pasarela = pasarelaPara(modo).nombre;
  } catch (error) {
    operativa = false;
    advertencia = error instanceof ErrorApp ? error.message : 'La pasarela no está disponible';
  }
  const faltantes = modo === 'Real' && operativa ? variablesQueFaltan() : [];
  if (faltantes.length > 0) {
    operativa = false;
    advertencia =
      `El modo real está activo pero falta configurar ${enumerar(faltantes)} ` +
      'en el servidor. Los cobros en línea van a fallar hasta hacerlo.';
  }

  return {
    modo,
    pasarela,
    pasarelaReal: process.env.PAGO_PASARELA_REAL ?? 'Libelula',
    operativa,
    advertencia,
    actualizadoEn: fila?.actualizado_en.toISOString() ?? null,
    actualizadoPor: fila?.actualizado_por ?? null,
    pasarelasDisponibles: pasarelasRealesDisponibles(),
  };
}

function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

/** Lo que Libélula necesita para operar. Sin esto, «Real» fallaría en cada cobro. */
function variablesQueFaltan(): string[] {
  return [
    ['LIBELULA_URL_BASE', process.env.LIBELULA_URL_BASE],
    ['LIBELULA_API_KEY', process.env.LIBELULA_API_KEY],
    ['LIBELULA_EMAIL_COMERCIO', process.env.LIBELULA_EMAIL_COMERCIO],
    ['PAGO_URL_PUBLICA', process.env.PAGO_URL_PUBLICA],
  ]
    .filter(([, valor]) => !valor)
    .map(([nombre]) => nombre as string);
}

export async function cambiarModoCobro(sesion: Sesion, modo: ModoCobro): Promise<EstadoCobroDTO> {
  if (modo === 'Real') {
    // ErrorApp 503 si no hay adaptador para la pasarela configurada.
    pasarelaPara('Real');
    const faltantes = variablesQueFaltan();
    if (faltantes.length > 0) {
      throw new ErrorApp(
        409,
        `No se puede activar el cobro real: falta configurar ${enumerar(faltantes)} ` +
          'en el servidor. Configúrelas y vuelva a intentarlo.',
      );
    }
  }
  await configModel.guardar(CLAVE_MODO_COBRO, modo, `${sesion.nombre} ${sesion.apellido}`.trim());
  invalidarCache();
  return estadoCobro();
}
