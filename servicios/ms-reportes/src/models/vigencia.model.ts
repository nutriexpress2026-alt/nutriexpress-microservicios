import { bd } from '../config/mongo.js';
import type { AlmacenDeVigencias } from '../middlewares/sesiones-vigentes.js';

/**
 * Capa Model — desde cuándo valen las sesiones de un usuario o de un rol, tras
 * un cambio de permisos (HU-05). Los otros servicios lo guardan en su tabla
 * `sesion_vigente`; ms-reportes, en su colección de MongoDB.
 *
 * Leer y después escribir es seguro aquí: los eventos se atienden de a uno.
 */
interface DocVigencia {
  _id: string;
  desde: Date;
}

const coleccion = async () => (await bd()).collection<DocVigencia>('sesiones_vigentes');

export const almacenDeVigencias: AlmacenDeVigencias = {
  async todas() {
    return (await (await coleccion()).find().toArray()).map((d) => ({ clave: d._id, desde: d.desde }));
  },
  async guardar(clave: string, desde: Date) {
    const c = await coleccion();
    const actual = await c.findOne({ _id: clave });
    if (actual && actual.desde >= desde) return;
    await c.updateOne({ _id: clave }, { $set: { desde } }, { upsert: true });
  },
};
