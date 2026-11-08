import 'dotenv/config';

process.env.TZ = process.env.ZONA_HORARIA ?? 'America/La_Paz';

function requerido(clave: string): string {
  const valor = process.env[clave];
  if (!valor) throw new Error(`Falta la variable de entorno ${clave}`);
  return valor;
}

export const env = {
  databaseUrl: requerido('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4004),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** Servicios a los que ms-pedidos llama por REST interno (rutas /interno, RNF-ARQ-02). */
  catalogoUrl: process.env.CATALOGO_URL ?? 'http://ms-catalogo:4002',
  inventarioUrl: process.env.INVENTARIO_URL ?? 'http://ms-inventario:4003',
  pagosUrl: process.env.PAGOS_URL ?? 'http://ms-pagos:4005',
  identidadUrl: process.env.IDENTIDAD_URL ?? 'http://ms-identidad:4001',
} as const;
