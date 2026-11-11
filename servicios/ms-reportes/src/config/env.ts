import 'dotenv/config';

process.env.TZ = process.env.ZONA_HORARIA ?? 'America/La_Paz';

export const env = {
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27018/reportes',
  port: Number(process.env.PORT ?? 4007),
  /**
   * Correo saliente (SMTP). Sin SMTP_HOST, los correos no se envían: se
   * muestran en el registro del servicio (desarrollo y pruebas).
   */
  correo: {
    host: process.env.SMTP_HOST || null,
    puerto: Number(process.env.SMTP_PUERTO ?? 587),
    usuario: process.env.SMTP_USUARIO || undefined,
    clave: process.env.SMTP_CLAVE || undefined,
    /**
     * HT-04 · En el servidor el correo va al Postfix de la misma máquina, que tiene un
     * certificado autofirmado: ese tramo no sale del servidor y se hace sin TLS. Postfix
     * cifra después, al reenviarlo al servidor de correo.
     */
    sinTls: process.env.SMTP_SIN_TLS === 'true',
    remitente: process.env.CORREO_REMITENTE || 'NutriExpress <no-responder@nutriexpress.bo>',
  },
} as const;
