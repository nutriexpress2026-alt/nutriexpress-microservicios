import * as usuarioModel from '../models/usuario.model.js';
import * as recuperacionModel from '../models/recuperacion.model.js';
import { generarCodigo, huellaDeCodigo, mismaHuella } from '../utils/codigo.js';
import { hashearContrasena } from '../utils/hash.js';
import { avisar } from './aviso.service.js';
import { ErrorApp } from '../errors/error-app.js';
import type { DatosRestablecerContrasena, DatosVerificarCodigo } from '../dtos/auth.dto.js';

/**
 * HU-06 «Olvidé mi contraseña»: un código de seis dígitos al correo de la cuenta.
 *
 * Criterios de aceptación: el código vence a los 15 minutos y sirve una vez; la
 * respuesta es la misma exista o no la cuenta.
 *
 * ms-identidad no manda correos: publica `CodigoRecuperacionGenerado` y
 * ms-reportes lo convierte en correo (catálogo de eventos, sección 3.1.7).
 */
export const MINUTOS_DE_VIGENCIA = 15;
export const MAX_INTENTOS = 5;
/** A cada cuenta no se le manda más de un código por minuto (la pantalla espera lo mismo). */
export const SEGUNDOS_ENTRE_CODIGOS = 60;
export const MENSAJE_SOLICITUD = 'Si hay una cuenta con ese dato, le enviamos un código a su correo.';

/** Lo que viaja en `CodigoRecuperacionGenerado`: justo lo que hace falta para escribir el correo. */
export interface DatosCodigoRecuperacion {
  idUsuario: number;
  email: string;
  nombre: string;
  codigo: string;
  venceEn: string;
  minutos: number;
}

/** Con el correo o con el nombre de usuario: cada uno recuerda uno de los dos. */
const buscarCuenta = (identificador: string) =>
  identificador.includes('@')
    ? usuarioModel.buscarPorEmail(identificador)
    : usuarioModel.buscarPorNombreUsuario(identificador);

export async function solicitarCodigo(identificador: string): Promise<{ mensaje: string }> {
  const respuesta = { mensaje: MENSAJE_SOLICITUD };
  const usuario = await buscarCuenta(identificador);
  // La misma respuesta exista o no la cuenta: no sirve para averiguar quién está registrado.
  if (!usuario || !usuario.activo) return respuesta;

  // Pedir otro antes de un minuto no manda nada: protege el correo del dueño de
  // quien pide códigos en su nombre, y el tope diario de la cuenta de envío.
  const anterior = await recuperacionModel.ultimo(usuario.id_usuario);
  if (anterior && Date.now() - anterior.creado_en.getTime() < SEGUNDOS_ENTRE_CODIGOS * 1000) {
    return respuesta;
  }

  const codigo = generarCodigo();
  const venceEn = new Date(Date.now() + MINUTOS_DE_VIGENCIA * 60_000);
  await recuperacionModel.crear(usuario.id_usuario, huellaDeCodigo(usuario.id_usuario, codigo), venceEn);
  await avisar<DatosCodigoRecuperacion>('CodigoRecuperacionGenerado', {
    idUsuario: usuario.id_usuario,
    email: usuario.email,
    nombre: usuario.nombre,
    codigo,
    venceEn: venceEn.toISOString(),
    minutos: MINUTOS_DE_VIGENCIA,
  });
  return respuesta;
}

/**
 * El código vale si es el último pedido por la cuenta, no venció, no se usó y
 * no agotó sus intentos. Cada error suma un intento: con cinco por código, adivinar
 * uno de un millón no es una opción.
 *
 * Que el mensaje de un código equivocado diga los intentos que quedan revela que la
 * cuenta existe, pero solo a quien ya pidió un código para ella; y el registro de
 * clientes ya lo revela de todos modos («ya existe una cuenta con ese correo»).
 */
async function codigoVigente({ identificador, codigo }: DatosVerificarCodigo) {
  const usuario = await buscarCuenta(identificador);
  const registro = usuario?.activo ? await recuperacionModel.ultimo(usuario.id_usuario) : null;
  if (!usuario || !registro || registro.usado_en || registro.expira_en.getTime() <= Date.now()) {
    throw new ErrorApp(400, 'El código venció o no es válido. Pida uno nuevo.');
  }
  if (registro.intentos >= MAX_INTENTOS) {
    throw new ErrorApp(400, 'Agotó los intentos para este código. Pida uno nuevo.');
  }
  if (!mismaHuella(registro.codigo_hash, huellaDeCodigo(usuario.id_usuario, codigo))) {
    const restantes = MAX_INTENTOS - (await recuperacionModel.sumarIntento(registro.id_recuperacion));
    throw new ErrorApp(
      400,
      restantes > 0
        ? `El código no es correcto. Le quedan ${restantes} intento(s).`
        : 'El código no es correcto y ya no le quedan intentos. Pida uno nuevo.',
    );
  }
  return { usuario, registro };
}

/** Confirma el código antes de pedir la contraseña nueva; no lo gasta. */
export async function verificarCodigo(datos: DatosVerificarCodigo): Promise<{ valido: true }> {
  await codigoVigente(datos);
  return { valido: true };
}

/** Cambia la contraseña, desbloquea la cuenta y gasta el código. */
export async function restablecerContrasena(datos: DatosRestablecerContrasena): Promise<{ mensaje: string }> {
  const { usuario, registro } = await codigoVigente(datos);
  const aplicado = await recuperacionModel.restablecer(
    registro.id_recuperacion,
    usuario.id_usuario,
    await hashearContrasena(datos.contrasena),
  );
  if (!aplicado) throw new ErrorApp(400, 'Ese código ya se usó. Pida uno nuevo.');
  return { mensaje: 'Su contraseña fue cambiada. Ya puede iniciar sesión.' };
}
