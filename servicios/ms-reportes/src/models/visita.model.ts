import { bd } from '../config/mongo.js';

/**
 * Contador de visitas por página (RF-WEB-03, HU-31).
 *
 * Un documento por ruta: { _id: '/portal', total: 120, desde: Date }. Sumar una
 * visita es una sola operación atómica ($inc con upsert): dos visitas al mismo
 * tiempo no se pisan y no hace falta leer antes de escribir. Es una de las
 * razones para que este servicio use MongoDB (sección 3.1.7).
 *
 * La excepción es la primera visita de una página: si llegan dos a la vez,
 * las dos intentan crear el documento y una choca con la clave duplicada
 * (E11000). Para entonces el documento ya existe, así que basta repetirla.
 */
interface DocVisita {
  _id: string;
  total: number;
  desde: Date;
}

async function coleccion() {
  return (await bd()).collection<DocVisita>('visitas');
}

const CLAVE_DUPLICADA = 11000;

export async function sumar(ruta: string, reintento = false): Promise<DocVisita> {
  try {
    const doc = await (await coleccion()).findOneAndUpdate(
      { _id: ruta },
      { $inc: { total: 1 }, $setOnInsert: { desde: new Date() } },
      { upsert: true, returnDocument: 'after' },
    );
    return doc!;
  } catch (e) {
    if (!reintento && (e as { code?: number }).code === CLAVE_DUPLICADA) return sumar(ruta, true);
    throw e;
  }
}

export async function buscar(ruta: string): Promise<DocVisita | null> {
  return (await coleccion()).findOne({ _id: ruta });
}
