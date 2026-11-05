import { prisma } from '../config/prisma.js';
import type { Evento, RegistroDeEventos } from '../config/eventos.js';

/**
 * Capa Model — eventos que este servicio ya procesó (tabla evento_procesado,
 * HT-03, RNF-DIS-03): un evento repetido no se procesa dos veces.
 */
export const registroDeEventos: RegistroDeEventos = {
  async yaProcesado(id: string) {
    return (await prisma.evento_procesado.count({ where: { id_evento: id } })) > 0;
  },
  async marcarProcesado(evento: Evento) {
    // skipDuplicates: si otro intento lo anotó primero, no es un error.
    await prisma.evento_procesado.createMany({
      data: [{ id_evento: evento.id, tipo: evento.tipo }],
      skipDuplicates: true,
    });
  },
};
