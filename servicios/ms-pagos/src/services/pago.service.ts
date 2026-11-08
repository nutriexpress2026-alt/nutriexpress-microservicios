import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import * as pagoModel from '../models/pago.model.js';
import type { ClientePrisma, PagoConsultado } from '../models/pago.model.js';
import { modoCobro } from './configuracion.service.js';
import { avisar } from './aviso.service.js';
import { pasarelaPara } from '../pagos/index.js';
import { esPagoFinal, type EstadoPago, type MetodoPago, type ModoCobro } from '../config/dominio.js';
import type { Sesion } from '../middlewares/auth.middleware.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * HU-26 · Cobro en línea de los pedidos con QR o tarjeta (RF-PAG-01, RF-PAG-02).
 *
 * Adaptado del sistema anterior. Este servicio es el único lugar donde un cobro
 * cambia de estado; el pedido no se toca desde aquí (vive en ms-pedidos,
 * RNF-ARQ-02): el desenlace se publica como evento —PagoConfirmado o
 * PagoFallido— y ms-pedidos lo aplica a su pedido (saga coreografiada, 3.1.7).
 *
 * Dos ideas sostienen el diseño:
 *
 * 1. **Idempotencia.** Las pasarelas reintentan sus avisos. El cierre ocurre con
 *    un `UPDATE ... WHERE estado = 'Pendiente'`, así que el segundo aviso no
 *    encuentra nada que cambiar ni publica otro evento.
 * 2. **No confiar en que el aviso llegue.** Consultar un cobro pendiente le
 *    pregunta a la pasarela en vez de esperar sentado.
 */

const MONEDA = 'BOB';

/** Diferencia tolerada al contrastar el monto de la pasarela con el nuestro. */
const TOLERANCIA_MONTO = 0.01;

export interface PagoDTO {
  id: number;
  monto: number;
  moneda: string;
  metodo: MetodoPago;
  estado: EstadoPago;
  modo: ModoCobro;
  pasarela: string;
  /** Identificador del lado de la pasarela: es lo que se cita en un reclamo. */
  referenciaExterna: string | null;
  /** Contenido del QR o dirección del checkout. Nulo mientras no se haya abierto. */
  datosCobro: string | null;
  tipoDatos: 'qr' | 'url' | null;
  /** El código ya dibujado, listo para `<img src>`. */
  qrImagen?: string;
  expiraEn: string | null;
  confirmadoEn: string | null;
  idVenta: number | null;
  idPedido: number | null;
  /** Por qué falló, cuando falló. */
  motivo?: string | null;
  /** Atajo para que la interfaz avise, sin ambigüedad, que no se movió dinero. */
  simulado: boolean;
}

/** Lo que llevan PagoConfirmado y PagoFallido (catálogo de eventos, 3.1.7). */
export interface DatosDesenlace {
  idPago: number;
  idPedido: number | null;
  idVenta: number | null;
  estado: EstadoPago;
  monto: number;
  metodo: MetodoPago;
  referenciaExterna: string | null;
  motivo: string;
}

function aDTO(pago: PagoConsultado): PagoDTO {
  const datos = pago.datos_cobro;
  return {
    id: pago.id_pago,
    monto: Number(pago.monto),
    moneda: pago.moneda,
    metodo: pago.metodo as MetodoPago,
    estado: pago.estado as EstadoPago,
    modo: pago.modo as ModoCobro,
    pasarela: pago.pasarela,
    referenciaExterna: pago.id_transaccion_ext,
    datosCobro: datos,
    // Lo dice la pasarela al abrir el cobro: adivinarlo por la forma del texto
    // le daba un QR a quien había elegido tarjeta.
    tipoDatos: pago.tipo_datos as 'qr' | 'url' | null,
    expiraEn: pago.fecha_expiracion?.toISOString() ?? null,
    confirmadoEn: pago.fecha_confirmacion?.toISOString() ?? null,
    idVenta: pago.id_venta,
    idPedido: pago.id_pedido,
    simulado: pago.modo === 'Simulado',
    // Solo cuando falló: en uno que salió bien, el último evento es la confirmación.
    motivo: pago.estado === 'Fallido' || pago.estado === 'Vencido' ? (pago.evento_pago[0]?.cuerpo ?? null) : null,
  };
}

/**
 * Añade el código dibujado, cuando lo hay. Una pasarela devuelve el **texto** a
 * codificar (la simulada) o el **código ya dibujado** (Libélula, en base64):
 * codificar una imagen excede la capacidad de un QR y la pantalla se quedaba
 * esperando un código que nunca llegaba.
 */
async function conQR(dto: PagoDTO): Promise<PagoDTO> {
  if (dto.tipoDatos !== 'qr' || !dto.datosCobro) return dto;
  if (dto.datosCobro.startsWith('data:image/')) {
    dto.qrImagen = dto.datosCobro;
    return dto;
  }
  try {
    dto.qrImagen = await QRCode.toDataURL(dto.datosCobro, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
  } catch {
    // Sin imagen la interfaz muestra el texto: es peor, pero no bloquea el cobro.
  }
  return dto;
}

async function exigirPago(id: number): Promise<PagoConsultado> {
  const pago = await pagoModel.buscarPorId(id);
  if (!pago) throw new ErrorApp(404, 'El cobro no existe');
  return pago;
}

/* ------------------------------------------------------------------ */
/* Alta del cobro (la pide ms-pedidos por REST interno)                */
/* ------------------------------------------------------------------ */

/**
 * La instalación que abre el cobro: dos servidores pueden compartir la cuenta de
 * Libélula y cada uno numera sus pedidos desde 1. Se deduce de la dirección
 * pública, distinta en cada uno.
 */
const INSTALACION = createHash('sha256')
  .update(env.pago.urlPublica || 'local')
  .digest('hex')
  .slice(0, 6)
  .toUpperCase();

/**
 * El identificador con el que el cobro se registra en la pasarela: Libélula
 * rechaza una deuda cuyo identificador ya tiene otra activa. El número de cobro
 * lo hace único dentro de la base, y la instalación, entre bases.
 */
export function referenciaDeCobro(base: string, idPago: number): string {
  return `${base}-C${idPago}-${INSTALACION}`;
}

export interface SolicitudDeCobro {
  idPedido?: number;
  idVenta?: number;
  monto: number;
  metodo: MetodoPago;
  /** «NutriExpress - Pedido 12»: lo que el cliente lee en la pasarela. */
  descripcion: string;
  cliente?: { nombre: string; email?: string };
}

/**
 * HU-26 · Registra el cobro con el modo vigente y lo abre en la pasarela.
 *
 * HU-27: el cobro guarda el modo con que nació; cambiarlo después no lo afecta.
 * Si la pasarela falla, el cobro queda como Fallido —constancia de que el
 * intento existió— y se responde 502 para que ms-pedidos deshaga el pedido.
 */
export async function crearYAbrir(solicitud: SolicitudDeCobro): Promise<PagoDTO> {
  if ((solicitud.idPedido === undefined) === (solicitud.idVenta === undefined)) {
    throw new ErrorApp(400, 'El cobro es de un pedido o de una venta');
  }
  if (solicitud.metodo === 'Efectivo') {
    throw new ErrorApp(400, 'El efectivo no pasa por la pasarela: se cobra en mano');
  }
  const modo = await modoCobro();
  const pasarela = pasarelaPara(modo);

  const pago = await prisma.$transaction(async (tx: ClientePrisma) => {
    const creado = await pagoModel.crear(tx, {
      monto: solicitud.monto,
      moneda: MONEDA,
      metodo: solicitud.metodo,
      estado: 'Pendiente',
      modo,
      pasarela: pasarela.nombre,
      idVenta: solicitud.idVenta ?? null,
      idPedido: solicitud.idPedido ?? null,
    });
    await pagoModel.registrarEvento(tx, {
      idPago: creado.id_pago,
      tipo: 'Creado',
      origen: 'Sistema',
      cuerpo: JSON.stringify({ monto: solicitud.monto, metodo: solicitud.metodo, modo }),
    });
    return creado;
  });

  const base = solicitud.idPedido !== undefined ? `PEDIDO-${solicitud.idPedido}` : `VENTA-${solicitud.idVenta}`;
  try {
    const cobro = await pasarela.crearCobro({
      monto: solicitud.monto,
      moneda: MONEDA,
      metodo: solicitud.metodo,
      descripcion: solicitud.descripcion,
      referenciaInterna: referenciaDeCobro(base, pago.id_pago),
      cliente: solicitud.cliente,
    });
    const abierto = await prisma.$transaction(async (tx: ClientePrisma) => {
      const fila = await pagoModel.registrarTransaccionExterna(
        pago.id_pago,
        {
          idTransaccionExterna: cobro.idTransaccionExterna,
          datosCobro: cobro.datosCobro,
          tipoDatos: cobro.tipoDatos,
          expiraEn: cobro.expiraEn,
        },
        tx,
      );
      await pagoModel.registrarEvento(tx, {
        idPago: pago.id_pago,
        tipo: 'Abierto en pasarela',
        origen: 'Sistema',
        cuerpo: JSON.stringify({
          idTransaccion: cobro.idTransaccionExterna,
          ...(cobro.observacion ? { observacion: cobro.observacion } : {}),
        }),
      });
      return fila;
    });
    return conQR(aDTO(abierto));
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'error desconocido';
    await prisma.$transaction(async (tx: ClientePrisma) => {
      await pagoModel.cerrarSiPendiente(tx, pago.id_pago, 'Fallido', null);
      await pagoModel.registrarEvento(tx, { idPago: pago.id_pago, tipo: 'Fallo al abrir', origen: 'Sistema', cuerpo: motivo });
    });
    throw error instanceof ErrorApp ? error : new ErrorApp(502, `No se pudo abrir el cobro en la pasarela: ${motivo}`);
  }
}

/* ------------------------------------------------------------------ */
/* Consulta y desenlace                                                */
/* ------------------------------------------------------------------ */

/**
 * Devuelve el cobro, preguntando a la pasarela si todavía está pendiente: si su
 * aviso nunca llegó, un cobro que solo esperara quedaría pendiente para siempre.
 * Es también el mecanismo por el que la pasarela simulada confirma.
 *
 * Se pregunta **antes** de mirar el plazo: nuestro plazo es más corto que el del
 * QR de la pasarela, y vencer primero cancelaba pedidos ya pagados.
 */
export async function obtener(idPago: number): Promise<PagoDTO> {
  const pago = await exigirPago(idPago);
  if (pago.estado !== 'Pendiente') return conQR(aDTO(pago));

  const estado = await estadoSegunLaPasarela(pago);
  if (estado && estado !== 'Pendiente') {
    return aplicarResultado(idPago, estado, 'Pasarela', 'Consulta directa de estado');
  }
  if (pago.fecha_expiracion && pago.fecha_expiracion < new Date()) {
    return aplicarResultado(idPago, 'Vencido', 'Sistema', 'Expiró el plazo del cobro');
  }
  return conQR(aDTO(pago));
}

/**
 * Le pregunta a la pasarela en qué quedó el cobro. `null` cuando no se pudo
 * saber, que es distinto de «sigue pendiente». El fallo se registra: un cobro
 * que nunca se resuelve y un error que nadie ve son el mismo síntoma.
 */
async function estadoSegunLaPasarela(pago: PagoConsultado): Promise<EstadoPago | null> {
  if (!pago.id_transaccion_ext) return null;
  try {
    return await pasarelaPara(pago.modo as ModoCobro).consultarEstado(pago.id_transaccion_ext);
  } catch (error) {
    console.error(
      `[pagos] No se pudo consultar el cobro ${pago.id_pago} (transacción ${pago.id_transaccion_ext}) en ${pago.pasarela}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Cierra el cobro y publica su desenlace.
 *
 * Idempotente: `cerrarSiPendiente` solo escribe si el cobro seguía pendiente, y
 * solo quien lo cerró publica el evento. Así un aviso repetido —o uno que se
 * cruza con la consulta directa— no confirma ni cancela dos veces.
 *
 * El evento sale **después** de confirmar la transacción: si RabbitMQ no
 * responde, el cobro queda cerrado igual y ms-pedidos se entera al consultar el
 * cobro de su pedido (RNF-DIS-01).
 */
export async function aplicarResultado(
  idPago: number,
  estado: EstadoPago,
  origen: 'Pasarela' | 'Sistema' | 'Empleado' | 'Cliente',
  detalle: string,
): Promise<PagoDTO> {
  if (!esPagoFinal(estado)) throw new ErrorApp(400, `"${estado}" no es un desenlace válido para un cobro`);

  const cerrado = await prisma.$transaction(async (tx: ClientePrisma) => {
    const pago = await pagoModel.buscarPorId(idPago, tx);
    if (!pago) throw new ErrorApp(404, 'El cobro no existe');
    const aplicado = await pagoModel.cerrarSiPendiente(tx, idPago, estado, estado === 'Pagado' ? new Date() : null);
    await pagoModel.registrarEvento(tx, {
      idPago,
      tipo: aplicado ? `Cerrado: ${estado}` : `Aviso repetido: ${estado}`,
      origen,
      cuerpo: detalle,
    });
    return aplicado ? pago : null;
  });

  if (cerrado) {
    const datos: DatosDesenlace = {
      idPago,
      idPedido: cerrado.id_pedido,
      idVenta: cerrado.id_venta,
      estado,
      monto: Number(cerrado.monto),
      metodo: cerrado.metodo as MetodoPago,
      referenciaExterna: cerrado.id_transaccion_ext,
      motivo: detalle.slice(0, 300),
    };
    await avisar(estado === 'Pagado' ? 'PagoConfirmado' : 'PagoFallido', datos);
  }
  return conQR(aDTO(await exigirPago(idPago)));
}

/* ------------------------------------------------------------------ */
/* Avisos de la pasarela (RF-PAG-02)                                   */
/* ------------------------------------------------------------------ */

/** Cuerpo del aviso, o vacío si no trae ninguno. Nunca lanza. */
function analizarCuerpo(cuerpoCrudo: string): Record<string, unknown> {
  if (!cuerpoCrudo.trim()) return {};
  try {
    const cuerpo: unknown = JSON.parse(cuerpoCrudo);
    return cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Encuentra el cobro del que habla un aviso: primero por el identificador de la
 * pasarela; si no, por la referencia que le dimos (Libélula repite en
 * `transaction_id` nuestra referencia, no su identificador).
 */
async function cobroDelAviso(pasarela: string, aviso: { idTransaccionExterna: string }, referencia: string | undefined) {
  const porTransaccion = await pagoModel.buscarPorTransaccionExterna(pasarela, aviso.idTransaccionExterna);
  if (porTransaccion) return porTransaccion;

  for (const candidata of [referencia, aviso.idTransaccionExterna]) {
    const partes = /^(PEDIDO|VENTA)-(\d+)-C(\d+)-([0-9A-F]+)$/.exec(candidata ?? '');
    // Otra instalación no debería avisar aquí, pero si lo hace no toca un cobro nuestro.
    if (!partes || partes[4] !== INSTALACION) continue;
    const id = Number(partes[2]);
    const pago = await pagoModel.buscarPorId(Number(partes[3]));
    const delMismoOrigen = pago && (partes[1] === 'PEDIDO' ? pago.id_pedido === id : pago.id_venta === id);
    if (delMismoOrigen) return pago;
  }
  return null;
}

/**
 * Procesa el aviso de la pasarela (webhook). La ruta es pública por necesidad
 * —la llama un servidor ajeno—: la firma se verifica **antes** de mirar el
 * contenido, y se contrasta el monto, para que nadie pague menos manipulándolo.
 */
export async function procesarAviso(
  cuerpoCrudo: string,
  cabeceras: Record<string, string | undefined>,
  parametros: Record<string, unknown> = {},
): Promise<{ procesado: boolean }> {
  const pasarela = pasarelaPara(await modoCobro());
  if (!pasarela.verificarFirma(cuerpoCrudo, cabeceras)) throw new ErrorApp(401, 'La firma del aviso no es válida');

  // Libélula avisa con los datos en la dirección y sin cuerpo.
  const aviso = pasarela.interpretarAviso({ ...parametros, ...analizarCuerpo(cuerpoCrudo) });
  const pago = await cobroDelAviso(pasarela.nombre, aviso, cabeceras['x-referencia-pago']);
  // Un aviso de un cobro desconocido puede ser de otro ambiente: se recibe y no se hace nada.
  if (!pago) return { procesado: false };

  if (aviso.estado === 'Pagado' && aviso.monto !== undefined && Number(pago.monto) - aviso.monto > TOLERANCIA_MONTO) {
    await prisma.$transaction((tx: ClientePrisma) =>
      pagoModel.registrarEvento(tx, {
        idPago: pago.id_pago,
        tipo: 'Monto no coincide',
        origen: 'Pasarela',
        cuerpo: `Esperado ${String(pago.monto)}, informado ${aviso.monto}`,
      }),
    );
    throw new ErrorApp(409, 'El monto informado no corresponde al del cobro');
  }
  if (aviso.estado === 'Pendiente') return { procesado: false };

  await aplicarResultado(pago.id_pago, aviso.estado, 'Pasarela', cuerpoCrudo);
  return { procesado: true };
}

/**
 * Confirmación manual por un empleado (QR estático: alguien verifica en el banco
 * que el dinero llegó). Queda registrado quién confirmó: es dinero.
 */
export async function confirmarManual(sesion: Sesion, idPago: number): Promise<PagoDTO> {
  const pago = await exigirPago(idPago);
  if (pago.estado !== 'Pendiente') throw new ErrorApp(409, `El cobro ya está ${pago.estado.toLowerCase()}`);
  return aplicarResultado(idPago, 'Pagado', 'Empleado', `Confirmado manualmente por ${sesion.nombre} ${sesion.apellido}`);
}

export async function anular(sesion: Sesion, idPago: number): Promise<PagoDTO> {
  const pago = await exigirPago(idPago);
  if (pago.estado !== 'Pendiente') throw new ErrorApp(409, `El cobro ya está ${pago.estado.toLowerCase()}`);
  return aplicarResultado(idPago, 'Fallido', 'Empleado', `Anulado por ${sesion.nombre} ${sesion.apellido}`);
}

/**
 * Evento PedidoCancelado (HU-25): el cliente canceló un pedido cuyo cobro seguía
 * pendiente. El cobro se cierra, para que un pago tardío no confirme un pedido
 * que ya no existe. Si ya estaba pagado no se toca: la devolución es aparte.
 */
export async function cerrarPorPedidoCancelado(idPedido: number): Promise<void> {
  const pago = await pagoModel.buscarDePedido(idPedido);
  if (!pago || pago.estado !== 'Pendiente') return;
  await aplicarResultado(pago.id_pago, 'Fallido', 'Sistema', 'El pedido se canceló antes de pagarse');
}

/* ------------------------------------------------------------------ */
/* Efectivo y anulación (Sprint 5)                                     */
/* ------------------------------------------------------------------ */

/**
 * HU-18, HU-24 · El efectivo que ya se recibió: una venta de mostrador cobrada en
 * mano o un pedido que el repartidor entregó («entregar cobra el efectivo»). No
 * pasa por pasarela: nace Pagado, para que `pago` sea la única respuesta a
 * «cuánto entró y por qué medio». Repetirlo devuelve el mismo cobro.
 */
export async function registrarEfectivo(datos: { idPedido?: number; idVenta?: number; monto: number; quien: string }): Promise<PagoDTO> {
  if ((datos.idPedido === undefined) === (datos.idVenta === undefined)) {
    throw new ErrorApp(400, 'El cobro es de un pedido o de una venta');
  }
  const previo = await prisma.pago.findFirst({
    where: { metodo: 'Efectivo', estado: 'Pagado', id_pedido: datos.idPedido ?? null, id_venta: datos.idVenta ?? null },
    select: { id_pago: true },
  });
  if (previo) return aDTO(await exigirPago(previo.id_pago));

  const modo = await modoCobro();
  const pago = await prisma.$transaction(async (tx: ClientePrisma) => {
    const creado = await pagoModel.crear(tx, {
      monto: datos.monto,
      moneda: MONEDA,
      metodo: 'Efectivo',
      estado: 'Pagado',
      modo,
      pasarela: 'Mostrador',
      idPedido: datos.idPedido ?? null,
      idVenta: datos.idVenta ?? null,
      fechaConfirmacion: new Date(),
    });
    await pagoModel.registrarEvento(tx, {
      idPago: creado.id_pago,
      tipo: datos.idPedido !== undefined ? 'Cobrado contra entrega' : 'Cobrado en mostrador',
      origen: 'Empleado',
      cuerpo: `Recibido por ${datos.quien}`,
    });
    return creado;
  });
  return aDTO(await exigirPago(pago.id_pago));
}

/**
 * HU-19 · Cierra el cobro de una venta anulada. Uno pendiente pasa a Fallido
 * (nunca entró el dinero); uno pagado, a Reembolsado, que **registra la deuda, no
 * la salda**: devolver el dinero es un acto aparte, en la caja o en la pasarela.
 */
export async function cerrarPorAnulacionDeVenta(idVenta: number, detalle: string): Promise<{ requiereDevolucion: boolean }> {
  const pago = await pagoModel.buscarDeVenta(idVenta);
  if (!pago) return { requiereDevolucion: false };
  if (pago.estado === 'Pendiente') {
    await aplicarResultado(pago.id_pago, 'Fallido', 'Empleado', detalle);
    return { requiereDevolucion: false };
  }
  if (pago.estado === 'Pagado') {
    await prisma.$transaction(async (tx: ClientePrisma) => {
      await pagoModel.marcarReembolsado(tx, pago.id_pago);
      await pagoModel.registrarEvento(tx, { idPago: pago.id_pago, tipo: 'Reembolso pendiente de entrega', origen: 'Empleado', cuerpo: detalle });
    });
    return { requiereDevolucion: true };
  }
  return { requiereDevolucion: false };
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export async function listar(filtro: { estado?: string; modo?: string }): Promise<PagoDTO[]> {
  return (await pagoModel.listar(filtro)).map(aDTO);
}

/** El cobro de una venta, para ms-ventas (REST interno). Pregunta a la pasarela si sigue pendiente. */
export async function deVenta(idVenta: number): Promise<PagoDTO | null> {
  const pago = await pagoModel.buscarDeVenta(idVenta);
  return pago ? obtener(pago.id_pago) : null;
}

/** El cobro de un pedido, para ms-pedidos (REST interno). Pregunta a la pasarela si sigue pendiente. */
export async function dePedido(idPedido: number): Promise<PagoDTO | null> {
  const pago = await pagoModel.buscarDePedido(idPedido);
  return pago ? obtener(pago.id_pago) : null;
}

/**
 * Vence los cobros cuyo plazo expiró (HU-26: «si vence, el pedido se cancela y
 * el stock se libera»). Corre solo, cada `PAGO_SEGUNDOS_BARRIDO`. También aquí se
 * pregunta antes de vencer, y si la pasarela no contesta el cobro no se vence:
 * es preferible un pedido que tarda en resolverse a uno cancelado ya pagado.
 */
export async function vencerPendientes(): Promise<number> {
  let cerrados = 0;
  for (const pago of await pagoModel.pendientesVencidos()) {
    const estado = await estadoSegunLaPasarela(pago);
    if (estado && estado !== 'Pendiente') {
      await aplicarResultado(pago.id_pago, estado, 'Pasarela', 'Consulta al vencer el plazo');
      cerrados++;
      continue;
    }
    if (estado === null && pago.id_transaccion_ext) continue;
    await aplicarResultado(pago.id_pago, 'Vencido', 'Sistema', 'Expiró el plazo del cobro');
    cerrados++;
  }
  return cerrados;
}
