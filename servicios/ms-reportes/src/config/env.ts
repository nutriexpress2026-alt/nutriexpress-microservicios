import 'dotenv/config';

process.env.TZ = process.env.ZONA_HORARIA ?? 'America/La_Paz';

export const env = {
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27018/reportes',
  port: Number(process.env.PORT ?? 4007),
} as const;
