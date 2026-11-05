import 'dotenv/config';

/*
 * La zona horaria la fija la aplicación, no la máquina: los contenedores
 * corren en UTC y el negocio está en Bolivia.
 */
process.env.TZ = process.env.ZONA_HORARIA ?? 'America/La_Paz';

function requerido(clave: string): string {
  const valor = process.env[clave];
  if (!valor) throw new Error(`Falta la variable de entorno ${clave}`);
  return valor;
}

export const env = {
  databaseUrl: requerido('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** Carpeta del par de claves RS256 con que se firman los tokens. */
  clavesDir: process.env.CLAVES_DIR ?? './claves',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
  maxIntentosFallidos: Number(process.env.MAX_INTENTOS_FALLIDOS ?? 3),
  /** Redis, complemento en memoria (RNF-ARQ-03). Sin él (las pruebas), los límites cuentan en memoria. */
  redisUrl: process.env.REDIS_URL ?? null,

  seguridad: {
    maxIntentosPorIp: Number(process.env.MAX_INTENTOS_POR_IP ?? 10),
    ventanaIntentosMs: Number(process.env.VENTANA_INTENTOS_MS ?? 15 * 60_000),
    minutosDeBloqueo: Number(process.env.MINUTOS_DE_BLOQUEO ?? 15),
  },
} as const;
