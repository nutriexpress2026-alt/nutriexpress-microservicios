import 'dotenv/config';

process.env.TZ = process.env.ZONA_HORARIA ?? 'America/La_Paz';

function requerido(clave: string): string {
  const valor = process.env[clave];
  if (!valor) throw new Error(`Falta la variable de entorno ${clave}`);
  return valor;
}

export const env = {
  databaseUrl: requerido('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4002),
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;
