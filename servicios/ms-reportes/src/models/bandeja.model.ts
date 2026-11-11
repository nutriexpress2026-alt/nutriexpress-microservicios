import { bd } from '../config/mongo.js';
import type { FotoPedido } from '../dtos/reporte.dto.js';

/**
 * Capa Model — la bandeja de salida de los avisos al cliente (HU-32).
 *
 * Aplicar la foto de un pedido y mandar el correo son dos cosas: si el correo
 * falla, el reporte igual tiene que estar al día. Por eso el aviso se anota
 * aquí y lo manda después `aviso.service` (cada pocos segundos), con reintentos.
 * «El correo sale aunque el servicio de pedidos esté ocupado»: ms-pedidos ya
 * publicó y siguió con lo suyo.
 *
 * El `_id` es el del evento que lo originó: si el evento llega dos veces, el
 * aviso se anota una sola vez (RNF-DIS-03).
 */

export type TipoAviso =
  | 'pedido-recibido'
  | 'comprobante-pago'
  | 'comprobante-entrega'
  | 'en-preparacion'
  | 'en-camino'
  | 'entregado'
  | 'no-entregado';

export interface DocAviso {
  _id: string;
  tipo: TipoAviso;
  /** A quién: el correo se pide a ms-identidad al enviar, no al anotar. */
  idUsuario: number;
  pedido: FotoPedido;
  estado: 'Pendiente' | 'Enviado' | 'Fallido';
  intentos: number;
  ultimoError: string | null;
  creadoEn: Date;
  enviadoEn: Date | null;
  para: string | null;
}

/** Después de tantos intentos el aviso queda «Fallido» y se ve en el registro. */
export const MAXIMO_INTENTOS = 6;

const bandeja = async () => (await bd()).collection<DocAviso>('bandeja_correos');

const CLAVE_DUPLICADA = 11000;

export async function anotar(aviso: Pick<DocAviso, '_id' | 'tipo' | 'idUsuario' | 'pedido'>): Promise<void> {
  try {
    await (await bandeja()).insertOne({
      ...aviso,
      estado: 'Pendiente',
      intentos: 0,
      ultimoError: null,
      creadoEn: new Date(),
      enviadoEn: null,
      para: null,
    });
  } catch (e) {
    if ((e as { code?: number }).code !== CLAVE_DUPLICADA) throw e;
  }
}

export async function pendientes(limite = 20): Promise<DocAviso[]> {
  return (await bandeja()).find({ estado: 'Pendiente' }).sort({ creadoEn: 1 }).limit(limite).toArray();
}

export async function marcarEnviado(id: string, para: string): Promise<void> {
  await (await bandeja()).updateOne({ _id: id }, { $set: { estado: 'Enviado', enviadoEn: new Date(), para } });
}

export async function marcarFallo(id: string, error: string, intentos: number): Promise<void> {
  await (await bandeja()).updateOne(
    { _id: id },
    { $set: { ultimoError: error, intentos, estado: intentos >= MAXIMO_INTENTOS ? 'Fallido' : 'Pendiente' } },
  );
}

export async function todos(): Promise<DocAviso[]> {
  return (await bandeja()).find().sort({ creadoEn: 1 }).toArray();
}
