import { bd } from '../config/mongo.js';

/**
 * Contador de visitas por página (RF-WEB-03, HU-31).
 *
 * Un documento por ruta: { _id: '/portal', total: 120, desde: Date }. Sumar una
 * visita es una sola operación atómica ($inc con upsert): dos visitas al mismo
 * tiempo no se pisan y no hace falta leer antes de escribir. Es una de las
 * razones para que este servicio use MongoDB (sección 3.1.7).
 */
interface DocVisita {
  _id: string;
  total: number;
  desde: Date;
}

async function coleccion() {
  return (await bd()).collection<DocVisita>('visitas');
}

export async function sumar(ruta: string): Promise<DocVisita> {
  const doc = await (await coleccion()).findOneAndUpdate(
    { _id: ruta },
    { $inc: { total: 1 }, $setOnInsert: { desde: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );
  return doc!;
}

export async function buscar(ruta: string): Promise<DocVisita | null> {
  return (await coleccion()).findOne({ _id: ruta });
}
