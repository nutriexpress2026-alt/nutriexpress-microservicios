import { bd } from '../config/mongo.js';
import type { Evento, RegistroDeEventos } from '../config/eventos.js';

/**
 * Eventos que ms-reportes ya procesó (HT-03, RNF-DIS-03): un documento por
 * evento, con su identificador como `_id`. Así un evento repetido se reconoce
 * y no se procesa dos veces (no se manda dos veces el mismo correo).
 */
interface DocEvento {
  _id: string;
  tipo: string;
  origen: string;
  procesadoEn: Date;
}

async function coleccion() {
  return (await bd()).collection<DocEvento>('eventos_procesados');
}

const CLAVE_DUPLICADA = 11000;

export const registroDeEventos: RegistroDeEventos = {
  async yaProcesado(id) {
    return (await (await coleccion()).countDocuments({ _id: id }, { limit: 1 })) > 0;
  },
  async marcarProcesado(evento: Evento) {
    try {
      await (await coleccion()).insertOne({
        _id: evento.id,
        tipo: evento.tipo,
        origen: evento.origen,
        procesadoEn: new Date(),
      });
    } catch (e) {
      // Ya estaba: otro intento lo anotó primero. No es un error.
      if ((e as { code?: number }).code !== CLAVE_DUPLICADA) throw e;
    }
  },
};
