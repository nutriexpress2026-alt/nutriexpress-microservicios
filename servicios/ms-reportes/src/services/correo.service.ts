import { z } from 'zod';
import { enviarCorreo } from '../config/correo.js';
import type { Evento } from '../config/eventos.js';

/**
 * HU-06 · El código de «olvidé mi contraseña» llega por correo (T7.2).
 *
 * ms-identidad publica `CodigoRecuperacionGenerado` y aquí se convierte en
 * correo. Lo que llega se valida: un evento mal formado falla y va a la cola de
 * fallidos en vez de mandar un correo roto.
 */
const datosCodigo = z.object({
  email: z.email(),
  nombre: z.string().min(1),
  codigo: z.string().regex(/^\d{6}$/),
  minutos: z.number().int().positive(),
});

/** «123456» → «123 456»: se copia mejor a mano. */
const separado = (codigo: string) => `${codigo.slice(0, 3)} ${codigo.slice(3)}`;

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function enviarCodigoRecuperacion(evento: Evento): Promise<void> {
  const { email, nombre, codigo, minutos } = datosCodigo.parse(evento.datos);
  const texto = [
    `Hola, ${nombre}:`,
    '',
    `Su código para crear una contraseña nueva es: ${separado(codigo)}`,
    '',
    `Vence en ${minutos} minutos y sirve una sola vez.`,
    'Si usted no lo pidió, ignore este correo: su contraseña sigue igual.',
    '',
    'NutriExpress',
  ].join('\n');
  const html = `<p>Hola, ${escapar(nombre)}:</p>
<p>Su código para crear una contraseña nueva es:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${separado(codigo)}</p>
<p>Vence en ${minutos} minutos y sirve una sola vez.<br>
Si usted no lo pidió, ignore este correo: su contraseña sigue igual.</p>
<p>NutriExpress</p>`;
  await enviarCorreo({ para: email, asunto: 'Su código para recuperar la contraseña', texto, html });
}
