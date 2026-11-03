import { MongoClient, type Db } from 'mongodb';
import { env } from './env.js';

/**
 * Cliente único de MongoDB (RNF-ARQ-03: ms-reportes usa el gestor documental).
 * Solo la capa de modelos lo usa, igual que Prisma en los servicios relacionales.
 */
export const mongo = new MongoClient(env.mongoUrl);
let base: Db | null = null;

export async function bd(): Promise<Db> {
  if (!base) {
    await mongo.connect();
    base = mongo.db();
  }
  return base;
}
