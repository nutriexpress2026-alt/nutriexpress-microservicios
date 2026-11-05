import { createClient } from 'redis';
import { env } from './env.js';

/**
 * Redis de ms-identidad: complemento en memoria (RNF-ARQ-03), con todas sus
 * claves bajo el prefijo `identidad:`. No guarda nada que haga falta para que
 * el servicio funcione: si no responde, el servicio sigue (RNF-DIS-01).
 *
 * Es opcional: sin REDIS_URL (las pruebas) no hay cliente.
 */
export const redis = env.redisUrl
  ? createClient({
      url: env.redisUrl,
      // Si Redis se cae, cada orden falla enseguida en vez de quedar en cola.
      disableOfflineQueue: true,
    })
  : null;

if (redis) {
  // El cliente reintenta solo; se avisa al caer y al volver, no en cada reintento.
  let caido = false;
  redis.on('error', (e: Error) => {
    if (!caido) console.error(`ms-identidad: Redis no responde (${e.message}); se reintenta`);
    caido = true;
  });
  redis.on('ready', () => {
    if (caido) console.log('ms-identidad: Redis volvió');
    caido = false;
  });
  // Sin esperar: el servicio arranca aunque Redis tarde o no esté.
  redis.connect().catch(() => undefined);
}
