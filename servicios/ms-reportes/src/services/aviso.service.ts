import { enviarCorreo, type Adjunto } from '../config/correo.js';
import { env } from '../config/env.js';
import type { ComprobantePedidoDTO, FotoPedido } from '../dtos/reporte.dto.js';
import * as bandeja from '../models/bandeja.model.js';
import type { DocPedido } from '../models/proyeccion.model.js';
import { bolivianos } from '../utils/dinero.js';
import { comprobanteEnPdf } from './comprobante-pdf.service.js';

/**
 * HU-32 · Avisos por correo al cliente: que su pedido se recibió, el
 * comprobante cuando lo pagó, y cada cambio de estado. Las plantillas son las
 * del sistema anterior; lo nuevo es **cuándo** salen: ms-pedidos publica la
 * foto del pedido y sigue con lo suyo, ms-reportes decide si corresponde un
 * aviso, lo anota en la bandeja y lo manda después, con reintentos.
 */

const NOMBRE = 'NutriExpress';
const numeroDe = (id: number) => `#${String(id).padStart(5, '0')}`;
const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Envuelve el cuerpo en una plantilla sobria, legible en cualquier cliente de correo. */
function plantilla(titulo: string, cuerpo: string, pie?: string): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f5f5f4;font-family:system-ui,-apple-system,sans-serif;color:#1c1917">
  <div style="max-width:34rem;margin:0 auto;padding:2rem 1.25rem">
    <p style="margin:0 0 1.5rem;font-size:1.05rem;font-weight:600;color:#ea580c">${NOMBRE}</p>
    <h1 style="margin:0 0 1rem;font-size:1.3rem;font-weight:600;line-height:1.3">${titulo}</h1>
    <div style="font-size:.95rem;line-height:1.6;color:#44403c">${cuerpo}</div>
    ${pie ? `<p style="margin:2rem 0 0;padding-top:1rem;border-top:1px solid #e7e5e4;font-size:.8rem;color:#78716c">${pie}</p>` : ''}
  </div>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/* ¿Corresponde un aviso?                                              */
/* ------------------------------------------------------------------ */

/**
 * Qué aviso corresponde a una foto nueva del pedido, según cómo estaba antes.
 *
 * - Misma etapa (por ejemplo, solo se asignó repartidor): nada.
 * - «Pendiente de pago»: es un trámite interno, no se avisa.
 * - Recibido: si venía de «Pendiente de pago» se pagó en línea → comprobante;
 *   si no, es un pedido en efectivo recién confirmado.
 * - Entregado en efectivo: el comprobante reemplaza al aviso de entregado.
 * - Cancelado: solo si el repartidor no pudo entregar. Si lo canceló el propio
 *   cliente, o venció el cobro, ya lo sabe por la pantalla.
 */
export function avisoQueCorresponde(anterior: Pick<DocPedido, 'estado'> | null, foto: FotoPedido): bandeja.TipoAviso | null {
  if (anterior && anterior.estado === foto.estado) return null;
  switch (foto.estado) {
    case 'Recibido':
      return anterior?.estado === 'Pendiente de pago' ? 'comprobante-pago' : 'pedido-recibido';
    case 'En preparacion':
      return 'en-preparacion';
    case 'En camino':
      return 'en-camino';
    case 'Entregado':
      return foto.metodoPago === 'Efectivo' ? 'comprobante-entrega' : 'entregado';
    case 'Cancelado':
      return foto.motivo === 'No entregado' ? 'no-entregado' : null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Lo que se le pide a otros servicios                                 */
/* ------------------------------------------------------------------ */

async function obtenerJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return (await r.json()) as T;
}

/** El cliente, a ms-identidad (REST interno). */
const datosDelCliente = (idUsuario: number) =>
  obtenerJson<{ email: string; nombreCompleto: string; activo: boolean }>(`${env.identidadUrl}/interno/clientes/${idUsuario}`);

/** El correo de soporte del negocio (ms-catalogo). Sin él, el aviso sale igual. */
async function soporte(): Promise<string | undefined> {
  try {
    return (await obtenerJson<{ correo?: string }>(`${env.catalogoUrl}/api/negocio`)).correo || undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Armar cada correo                                                   */
/* ------------------------------------------------------------------ */

export function comprobanteDe(p: FotoPedido, correoSoporte: string, pagadoEn: string | null): ComprobantePedidoDTO {
  const detalle = p.items.map((l) => ({
    nombre: l.nombre,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    subtotal: Math.round(l.cantidad * l.precioUnitario * 100) / 100,
  }));
  return {
    numero: `Pedido ${numeroDe(p.idPedido)}`,
    fecha: p.fechaPedido,
    pagadoEn,
    cliente: p.cliente,
    entrega: p.direccion || '—',
    metodoPago: p.metodoPago,
    referenciaPago: p.referenciaPago ?? null,
    detalle,
    cantidadItems: detalle.reduce((t, l) => t + l.cantidad, 0),
    total: p.total,
    soporte: correoSoporte,
  };
}

interface Contenido {
  asunto: string;
  texto: string;
  html: string;
  adjuntos?: Adjunto[];
}

function avisoDeEstado(tipo: bandeja.TipoAviso, p: FotoPedido, nombre: string): Contenido {
  const numero = numeroDe(p.idPedido);
  const efectivo = p.metodoPago === 'Efectivo';
  const pagado = p.estadoPago === 'Pagado';
  const cuerpos: Partial<Record<bandeja.TipoAviso, { asunto: string; cuerpo: string }>> = {
    'pedido-recibido': {
      asunto: `Recibimos su pedido ${numero}`,
      cuerpo:
        `Su pedido por ${bolivianos(p.total)} quedó registrado.` +
        (efectivo ? ` Lo paga en efectivo al recibirlo: tenga listos ${bolivianos(p.total)}.` : '') +
        ' Le avisamos cuando entre a la cocina y cuando salga para su dirección.',
    },
    'en-preparacion': {
      asunto: 'Estamos preparando su pedido',
      cuerpo: 'Su pedido entró a la cocina. Le avisamos de nuevo cuando salga para su dirección.',
    },
    'en-camino': {
      asunto: 'Su pedido va en camino',
      cuerpo:
        'Su pedido salió y está en camino a la dirección que indicó. Ya falta poco.' +
        (efectivo && !pagado ? ` Tenga listos ${bolivianos(p.total)} para pagarle al repartidor.` : ''),
    },
    entregado: { asunto: 'Su pedido fue entregado', cuerpo: '¡Buen provecho! Gracias por elegirnos.' },
    'no-entregado': {
      asunto: 'No pudimos entregar su pedido',
      cuerpo:
        'Nuestro repartidor fue a la dirección que indicó y no pudo entregar el pedido, así que quedó cancelado. ' +
        (pagado ? 'Como ya lo había pagado en línea, el reembolso se gestiona por separado. ' : 'No se le cobró nada. ') +
        'Puede volver a pedirlo desde el portal cuando quiera.',
    },
  };
  const a = cuerpos[tipo]!;
  return {
    asunto: tipo === 'pedido-recibido' ? a.asunto : `${a.asunto} · ${numero}`,
    texto: `Hola ${nombre}:\n\n${a.cuerpo}\n\nPedido ${numero}\n\n${NOMBRE}`,
    html: plantilla(
      a.asunto,
      `<p>Hola ${escapar(nombre)}:</p><p>${a.cuerpo}</p><p style="color:#78716c">Pedido ${numero}</p>`,
      'Este es un aviso automático; no hace falta responderlo.',
    ),
  };
}

async function comprobante(tipo: 'comprobante-pago' | 'comprobante-entrega', p: FotoPedido, nombre: string, correoSoporte: string): Promise<Contenido> {
  const c = comprobanteDe(p, correoSoporte, tipo === 'comprobante-pago' ? p.actualizadoEn : p.fechaEntrega);
  const total = bolivianos(c.total);
  const numero = numeroDe(p.idPedido);
  const { asunto, primera } =
    tipo === 'comprobante-pago'
      ? {
          asunto: `Comprobante de pago · Pedido ${numero}`,
          primera: `Recibimos su pago de <strong>${total}</strong> con ${c.metodoPago}. Su pedido ya pasa a preparación.`,
        }
      : {
          asunto: `Su pedido fue entregado · ${numero}`,
          primera: `¡Buen provecho! Gracias por elegirnos. Pagó <strong>${total}</strong> en efectivo al recibirlo.`,
        };
  const lineas = c.detalle
    .map(
      (l) =>
        `<tr><td style="padding:.25rem 0">${l.cantidad} × ${escapar(l.nombre)}</td>` +
        `<td style="padding:.25rem 0;text-align:right;white-space:nowrap">${bolivianos(l.subtotal)}</td></tr>`,
    )
    .join('');
  return {
    asunto,
    texto:
      `Hola ${nombre}:\n\n${primera.replace(/<[^>]+>/g, '')}\n\n` +
      c.detalle.map((l) => `${l.cantidad} x ${l.nombre}: ${bolivianos(l.subtotal)}`).join('\n') +
      `\nTotal: ${total}\n\nEl comprobante va adjunto en PDF.\n¿Dudas? Escríbanos a ${correoSoporte}.\n\n${NOMBRE}`,
    html: plantilla(
      asunto,
      `<p>Hola ${escapar(nombre)}:</p><p>${primera}</p>
       <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin:1rem 0">${lineas}
         <tr><td style="padding:.5rem 0;border-top:1px solid #e7e5e4;font-weight:600">Total</td>
             <td style="padding:.5rem 0;border-top:1px solid #e7e5e4;text-align:right;font-weight:600">${total}</td></tr>
       </table>
       <p>El comprobante va adjunto en PDF.</p>`,
      `¿Dudas? Escríbanos a ${correoSoporte}.`,
    ),
    adjuntos: [{ nombre: `comprobante-pedido-${p.idPedido}.pdf`, contenido: await comprobanteEnPdf(c), tipo: 'application/pdf' }],
  };
}

/* ------------------------------------------------------------------ */
/* La bandeja de salida                                                */
/* ------------------------------------------------------------------ */

/** Anota el aviso que corresponde (si corresponde alguno). No envía nada. */
export async function anotarSiCorresponde(idEvento: string, anterior: DocPedido | null, foto: FotoPedido): Promise<void> {
  const tipo = avisoQueCorresponde(anterior, foto);
  if (tipo) await bandeja.anotar({ _id: idEvento, tipo, idUsuario: foto.idUsuario, pedido: foto });
}

/** Manda un aviso de la bandeja. Lanza si no se pudo (el que llama anota el intento). */
async function enviarAviso(a: bandeja.DocAviso): Promise<string> {
  const cliente = await datosDelCliente(a.idUsuario);
  const nombre = cliente.nombreCompleto.split(' ')[0] || cliente.nombreCompleto;
  const correoSoporte = (await soporte()) ?? env.correo.remitente.replace(/^.*<|>$/g, '');
  const contenido =
    a.tipo === 'comprobante-pago' || a.tipo === 'comprobante-entrega'
      ? await comprobante(a.tipo, a.pedido, nombre, correoSoporte)
      : avisoDeEstado(a.tipo, a.pedido, nombre);
  await enviarCorreo({ para: cliente.email, responderA: correoSoporte, ...contenido });
  return cliente.email;
}

let enCurso = false;

/** Recorre la bandeja y manda lo pendiente. Lo llama un temporizador (server.ts) y las pruebas. */
export async function enviarPendientes(): Promise<number> {
  if (enCurso) return 0;
  enCurso = true;
  let enviados = 0;
  try {
    for (const a of await bandeja.pendientes()) {
      try {
        await bandeja.marcarEnviado(a._id, await enviarAviso(a));
        enviados++;
      } catch (e) {
        const intentos = a.intentos + 1;
        await bandeja.marcarFallo(a._id, (e as Error).message, intentos);
        console.error(`ms-reportes: el aviso ${a.tipo} del pedido ${a.pedido.idPedido} no salió (intento ${intentos}: ${(e as Error).message})`);
      }
    }
  } finally {
    enCurso = false;
  }
  return enviados;
}

/* ------------------------------------------------------------------ */
/* HU-28, HU-29 · Un reporte por correo                                */
/* ------------------------------------------------------------------ */

/**
 * Manda un reporte ya generado, con su PDF. A diferencia de los avisos, este
 * **sí espera**: quien pidió el envío necesita saber si salió.
 */
export async function reporte(datos: { para: string[]; titulo: string; descripcion: string; adjunto: Adjunto }): Promise<{ enviado: boolean; motivo?: string }> {
  try {
    await enviarCorreo({
      para: datos.para,
      asunto: `${datos.titulo} · ${NOMBRE}`,
      texto: `${datos.descripcion}\n\nEl reporte va adjunto en formato PDF.\n\n${NOMBRE}`,
      html: plantilla(datos.titulo, `<p>${escapar(datos.descripcion)}</p><p>El reporte va adjunto en formato PDF.</p>`),
      adjuntos: [datos.adjunto],
    });
    return { enviado: true };
  } catch (e) {
    return { enviado: false, motivo: `El servidor de correo no aceptó el envío (${(e as Error).message})` };
  }
}
