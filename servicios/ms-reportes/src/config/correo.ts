import nodemailer from 'nodemailer';
import { env } from './env.js';

/**
 * Correo saliente de NutriExpress (ms-reportes es el único que manda correos).
 *
 * Con SMTP configurado (SMTP_HOST, SMTP_PUERTO, SMTP_USUARIO, SMTP_CLAVE), envía
 * de verdad. Sin él —desarrollo y pruebas— no envía nada: el correo queda en
 * `buzonLocal` y se muestra en el registro del servicio, para poder seguir el
 * flujo completo sin una cuenta de correo.
 */
export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export const enviaDeVerdad = env.correo.host !== null;

const transporte = enviaDeVerdad
  ? nodemailer.createTransport({
      host: env.correo.host!,
      port: env.correo.puerto,
      // 465 cifra desde el inicio; 587 empieza en claro y pasa a TLS (STARTTLS).
      secure: env.correo.puerto === 465,
      ignoreTLS: env.correo.sinTls,
      auth: env.correo.usuario ? { user: env.correo.usuario, pass: env.correo.clave } : undefined,
    })
  : null;

/** Los últimos correos «enviados» sin SMTP (solo en desarrollo y pruebas). */
export const buzonLocal: Correo[] = [];

export async function enviarCorreo(correo: Correo): Promise<void> {
  if (transporte) {
    await transporte.sendMail({
      from: env.correo.remitente,
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
    });
    return;
  }
  buzonLocal.push(correo);
  if (buzonLocal.length > 50) buzonLocal.shift();
  console.log(
    `ms-reportes: sin SMTP configurado, el correo no se envía.\n  Para: ${correo.para}\n  Asunto: ${correo.asunto}\n${correo.texto
      .split('\n')
      .map((l) => `  | ${l}`)
      .join('\n')}`,
  );
}
