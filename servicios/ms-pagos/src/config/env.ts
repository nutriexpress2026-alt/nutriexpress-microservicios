import 'dotenv/config';

process.env.TZ = process.env.ZONA_HORARIA ?? 'America/La_Paz';

function requerido(clave: string): string {
  const valor = process.env[clave];
  if (!valor) throw new Error(`Falta la variable de entorno ${clave}`);
  return valor;
}

export const env = {
  databaseUrl: requerido('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4005),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  pago: {
    /**
     * Cuánto tarda la pasarela simulada en dar el cobro por pagado: así el modo
     * simulado recorre el mismo camino asíncrono que el real. Las pruebas lo
     * ponen en 0.
     */
    retardoSimuladoMs: Number(process.env.PAGO_SIMULADO_RETARDO_MS ?? 2000),
    /** Vida del QR o del enlace de pago antes de darse por vencido. */
    minutosExpiracion: Number(process.env.PAGO_MINUTOS_EXPIRACION ?? 15),
    /** Cada cuánto se buscan cobros vencidos (HU-26: si vence, el pedido se cancela). */
    segundosBarrido: Number(process.env.PAGO_SEGUNDOS_BARRIDO ?? 60),
    /** Pasarela a usar cuando el modo es Real. */
    pasarelaReal: process.env.PAGO_PASARELA_REAL ?? 'Libelula',
    /**
     * Dirección pública del servidor, con esquema: la pasarela avisa del pago
     * llamándola desde fuera, así que `localhost` no sirve.
     */
    urlPublica: process.env.PAGO_URL_PUBLICA ?? '',
    /** Secreto con que se firma la referencia del cobro que vuelve en el aviso de Libélula. */
    secretoAvisos: process.env.PAGO_SECRETO_AVISOS ?? 'nutriexpress-desarrollo',
    libelula: {
      urlBase: process.env.LIBELULA_URL_BASE ?? '',
      apiKey: process.env.LIBELULA_API_KEY ?? '',
      /** Libélula exige un correo en cada deuda: el del comercio, si no hay del cliente. */
      emailComercio: process.env.LIBELULA_EMAIL_COMERCIO ?? '',
    },
  },
} as const;
