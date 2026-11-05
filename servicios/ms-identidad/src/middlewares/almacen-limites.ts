import { MemoryStore, type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { redis } from '../config/redis.js';

export type EnviarARedis = (...orden: string[]) => Promise<RedisReply>;

/** El cliente Redis del servicio, si está configurado. */
const enviarDelServicio: EnviarARedis | undefined = redis
  ? (...orden) => redis!.sendCommand(orden) as Promise<RedisReply>
  : undefined;

/**
 * Dónde cuentan sus intentos los límites por IP (T7.3, RNF-SEG-01).
 *
 * En Redis, para que los contadores **no se reinicien al reiniciar el
 * servicio**: con la memoria del proceso, reiniciarlo le devolvía el cupo
 * completo a quien estaba probando contraseñas.
 *
 * Si Redis no responde, cuenta en memoria mientras tanto: un límite de
 * seguridad nunca queda abierto por una caída (RNF-DIS-01). Al volver Redis,
 * se retoman sus contadores; lo contado en memoria durante el corte se pierde,
 * que es lo menos grave.
 */
export class AlmacenConRespaldo implements Store {
  readonly prefix: string;
  private readonly enRedis?: RedisStore;
  private readonly enMemoria = new MemoryStore();
  private caido = false;

  constructor(prefijo: string, enviar: EnviarARedis | undefined = enviarDelServicio) {
    this.prefix = prefijo;
    if (enviar) this.enRedis = new RedisStore({ sendCommand: enviar, prefix: prefijo });
  }

  init(opciones: Options): void {
    this.enMemoria.init(opciones);
    // Al arrancar, el cliente casi siempre se está conectando todavía y esto falla:
    // no se avisa, porque rate-limit-redis vuelve a intentarlo en el primer pedido,
    // y si Redis de verdad no responde, el aviso sale entonces.
    this.enRedis?.init(opciones).catch(() => undefined);
  }

  get(clave: string): Promise<ClientRateLimitInfo | undefined> {
    return this.intentar(
      () => this.enRedis!.get(clave),
      async () => this.enMemoria.get(clave),
    );
  }

  increment(clave: string): Promise<ClientRateLimitInfo> {
    return this.intentar(
      () => this.enRedis!.increment(clave),
      async () => this.enMemoria.increment(clave),
    );
  }

  decrement(clave: string): Promise<void> {
    return this.intentar(
      () => this.enRedis!.decrement(clave),
      async () => this.enMemoria.decrement(clave),
    );
  }

  resetKey(clave: string): Promise<void> {
    return this.intentar(
      () => this.enRedis!.resetKey(clave),
      async () => this.enMemoria.resetKey(clave),
    );
  }

  private async intentar<T>(conRedis: () => Promise<T>, conMemoria: () => Promise<T>): Promise<T> {
    if (!this.enRedis) return conMemoria();
    try {
      const resultado = await conRedis();
      if (this.caido) console.log(`ms-identidad: límites ${this.prefix} de vuelta en Redis`);
      this.caido = false;
      return resultado;
    } catch (e) {
      this.avisar(e);
      return conMemoria();
    }
  }

  private avisar(e: unknown) {
    if (!this.caido) {
      console.error(`ms-identidad: límites ${this.prefix} en memoria, Redis no responde (${(e as Error).message})`);
    }
    this.caido = true;
  }
}
