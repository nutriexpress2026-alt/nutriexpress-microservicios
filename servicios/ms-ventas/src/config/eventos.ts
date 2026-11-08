import { randomUUID } from 'node:crypto';
import amqp, {
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
  type RecoveringChannelModel,
} from 'amqplib';

/**
 * Eventos entre microservicios por RabbitMQ (HT-03, RNF-ARQ-05, RNF-DIS-03).
 *
 * Copia idéntica en cada servicio que publica o consume eventos
 * (servicios/compartido/eventos.ts → src/config/eventos.ts).
 *
 * - Un solo exchange de tipo topic, `nutriexpress.eventos`: cada evento se
 *   publica con su tipo como clave de ruteo (`PermisosCambiados`,
 *   `CodigoRecuperacionGenerado`...).
 * - Cada servicio que consume tiene **su** cola durable, `<servicio>.eventos`,
 *   atada a los tipos que le interesan. Si el servicio está apagado, los eventos
 *   lo esperan en su cola. La cola nace la primera vez que el servicio arranca.
 * - Cada evento lleva un identificador único, y el consumidor recuerda los que
 *   ya procesó en su propia base (RegistroDeEventos): un evento repetido no se
 *   procesa dos veces.
 * - Si un manejador falla, el evento se reintenta una vez; si vuelve a fallar,
 *   pasa a `<servicio>.eventos.fallidos` para revisarlo, en vez de girar sin fin.
 * - Si RabbitMQ no responde, el servicio arranca igual y se reconecta solo
 *   (RNF-DIS-01); al volver, se recrean los canales y los consumidores.
 */

export interface Evento<D = unknown> {
  /** Único: con él el consumidor reconoce un evento repetido. */
  id: string;
  tipo: string;
  /** Servicio que lo publicó. */
  origen: string;
  /** Cuándo se publicó (ISO 8601). */
  fecha: string;
  datos: D;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Manejador = (evento: Evento<any>) => Promise<void>;

/** Dónde recuerda un servicio los eventos que ya procesó (en su propia base, RNF-ARQ-02). */
export interface RegistroDeEventos {
  yaProcesado(id: string): Promise<boolean>;
  marcarProcesado(evento: Evento): Promise<void>;
}

export const INTERCAMBIO = 'nutriexpress.eventos';
const URL = process.env.RABBITMQ_URL ?? 'amqp://nutriexpress:nutriexpress@127.0.0.1:5673';

let servicio = '';
let registro: RegistroDeEventos | null = null;
let conexion: RecoveringChannelModel | null = null;
let modelo: ChannelModel | null = null;
let canalPublicar: ConfirmChannel | null = null;
let canalConsumir: Channel | null = null;
const manejadores = new Map<string, Manejador>();

/** La cola de este servicio y la de sus eventos fallidos. */
export const colaDe = (nombreServicio: string) => `${nombreServicio}.eventos`;
export const colaFallidosDe = (nombreServicio: string) => `${colaDe(nombreServicio)}.fallidos`;

/**
 * Atiende los eventos de un tipo. Se llama antes de `conectarEventos`; si ya
 * hay conexión, la cola se ata enseguida al tipo nuevo.
 */
export function suscribir(tipo: string, manejador: Manejador): void {
  manejadores.set(tipo, manejador);
  if (canalConsumir) void canalConsumir.bindQueue(colaDe(servicio), INTERCAMBIO, tipo);
}

/**
 * Conecta con RabbitMQ sin esperar a que responda: el servicio arranca igual
 * y la conexión se reintenta sola. `registro` es obligatorio si el servicio
 * consume eventos.
 */
export async function conectarEventos(opciones: { servicio: string; registro?: RegistroDeEventos }) {
  if (conexion) return;
  servicio = opciones.servicio;
  registro = opciones.registro ?? null;
  if (manejadores.size > 0 && !registro) {
    throw new Error(`${servicio}: para consumir eventos hace falta un RegistroDeEventos`);
  }
  // Reintentos cada vez más espaciados, pero nunca más de 5 s (amqplib llega hasta 30 s): tras un
  // corte largo, el servicio se entera pronto de que RabbitMQ volvió. Un reinicio de RabbitMQ tarda
  // unos 20 s en aceptar conexiones; eso no se acorta desde aquí.
  conexion = await amqp.connect(URL, { recovery: { setup: preparar, waitForConnect: false, maxDelay: 5000 } });
  conexion.on('connect-failed', (e: Error) => console.error(`eventos: no se pudo conectar con RabbitMQ (${e.message}); se reintenta`));
  conexion.on('disconnect', (e: Error) => {
    console.error(`eventos: se perdió la conexión con RabbitMQ (${e.message}); se reintenta`);
    modelo = canalPublicar = canalConsumir = null;
  });
  conexion.on('error', (e: Error) => console.error(`eventos: ${e.message}`));
}

/** Se ejecuta en cada conexión, la primera y las que siguen a un corte. */
async function preparar(nuevo: ChannelModel) {
  const publicar = await nuevo.createConfirmChannel();
  vigilar(publicar, 'publicar');
  await publicar.assertExchange(INTERCAMBIO, 'topic', { durable: true });
  canalPublicar = publicar;

  if (manejadores.size > 0) {
    const consumir = await nuevo.createChannel();
    vigilar(consumir, 'consumir');
    const cola = colaDe(servicio);
    const fallidos = colaFallidosDe(servicio);
    await consumir.assertQueue(fallidos, { durable: true });
    // Lo que se rechaza sin reintento va a la cola de fallidos (por el exchange por defecto).
    await consumir.assertQueue(cola, { durable: true, deadLetterExchange: '', deadLetterRoutingKey: fallidos });
    for (const tipo of manejadores.keys()) await consumir.bindQueue(cola, INTERCAMBIO, tipo);
    // De a uno: dos copias del mismo evento nunca se atienden a la vez, así que
    // la segunda siempre encuentra a la primera en el registro.
    await consumir.prefetch(1);
    await consumir.consume(cola, (mensaje) => {
      if (mensaje) void atender(consumir, mensaje);
    });
    canalConsumir = consumir;
  }
  modelo = nuevo;
}

/**
 * Un canal que emite `error` sin nadie escuchando tumba el proceso (así son los
 * EventEmitter de Node). Si RabbitMQ cierra el canal, se suelta para que la
 * siguiente reconexión cree otro.
 */
function vigilar(canal: Channel, uso: 'publicar' | 'consumir') {
  canal.on('error', (e: Error) => console.error(`eventos: error en el canal para ${uso} (${e.message})`));
  canal.on('close', () => {
    if (uso === 'publicar' && canalPublicar === canal) canalPublicar = null;
    if (uso === 'consumir' && canalConsumir === canal) canalConsumir = null;
  });
}

async function atender(canal: Channel, mensaje: ConsumeMessage) {
  let evento: Evento;
  try {
    evento = JSON.parse(mensaje.content.toString('utf8')) as Evento;
    if (!evento.id || !evento.tipo) throw new Error('sin id o sin tipo');
  } catch (e) {
    console.error(`eventos: mensaje mal formado, va a fallidos (${(e as Error).message})`);
    canal.nack(mensaje, false, false);
    return;
  }

  const manejador = manejadores.get(evento.tipo);
  // Un tipo que el servicio dejó de atender: la cola quedó atada de antes.
  if (!manejador) return canal.ack(mensaje);

  try {
    if (await registro!.yaProcesado(evento.id)) return canal.ack(mensaje);
    await manejador(evento);
    await registro!.marcarProcesado(evento);
    canal.ack(mensaje);
  } catch (e) {
    const reintento = !mensaje.fields.redelivered;
    console.error(
      `eventos: falló ${evento.tipo} ${evento.id} (${(e as Error).message}); ${reintento ? 'se reintenta' : 'va a fallidos'}`,
    );
    canal.nack(mensaje, false, reintento);
  }
}

/**
 * Publica un evento y espera a que RabbitMQ lo confirme. Si no hay conexión,
 * o se corta mientras se publica, reintenta con la siguiente hasta `esperaMs`
 * y, si no vuelve, rechaza: quien publica decide qué hacer (normalmente,
 * registrar el error y seguir).
 *
 * Los reintentos llevan **el mismo identificador**: si el primer envío sí
 * llegó, el consumidor reconoce el repetido y no lo procesa dos veces.
 */
export async function publicar<D>(tipo: string, datos: D, esperaMs = 5000): Promise<Evento<D>> {
  if (!conexion) throw new Error('eventos: falta llamar a conectarEventos');
  const evento: Evento<D> = { id: randomUUID(), tipo, origen: servicio, fecha: new Date().toISOString(), datos };
  const contenido = Buffer.from(JSON.stringify(evento));
  const limite = Date.now() + esperaMs;
  for (;;) {
    const canal = await esperar(() => canalPublicar, Math.max(0, limite - Date.now()));
    try {
      canal.publish(INTERCAMBIO, tipo, contenido, {
        persistent: true,
        contentType: 'application/json',
        messageId: evento.id,
        type: tipo,
        appId: servicio,
        timestamp: Math.floor(Date.now() / 1000),
      });
      await canal.waitForConfirms();
      return evento;
    } catch (e) {
      // El canal murió con el mensaje en vuelo: se suelta y se espera el de la reconexión.
      if (canalPublicar === canal) canalPublicar = null;
      if (Date.now() >= limite) throw e;
    }
  }
}

/** Para las pruebas y el arranque: espera a que la conexión y los consumidores estén listos. */
export async function eventosListos(esperaMs = 15000): Promise<void> {
  await esperar(() => (manejadores.size === 0 || canalConsumir) && modelo, esperaMs);
}

export async function cerrarEventos(): Promise<void> {
  const actual = conexion;
  conexion = modelo = canalPublicar = canalConsumir = null;
  manejadores.clear();
  if (actual) await actual.close().catch(() => undefined);
}

async function esperar<T>(listo: () => T | null | undefined | false, esperaMs: number): Promise<T> {
  const limite = Date.now() + esperaMs;
  for (;;) {
    const valor = listo();
    if (valor) return valor;
    if (Date.now() >= limite) throw new Error('eventos: RabbitMQ no responde');
    await new Promise((r) => setTimeout(r, 100));
  }
}
