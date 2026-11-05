import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { validarCuerpo } from '../middlewares/validate.middleware.js';
import { requiereAutenticacion } from '../middlewares/auth.middleware.js';
import { limiteDeIntentos, limiteDeSolicitudes } from '../middlewares/seguridad.middleware.js';
import {
  esquemaRestablecerContrasena,
  esquemaSolicitarCodigo,
  esquemaVerificarCodigo,
} from '../dtos/auth.dto.js';

const router = Router();

/**
 * HU-01 Iniciar sesión (RF-SEG-01, RF-SEG-04).
 *
 * El límite por IP va **antes** de la validación: si ya se agotaron los
 * intentos, no hay por qué gastar trabajo en interpretar el cuerpo.
 */
/**
 * El inicio de sesión **no** lleva límite por dirección IP.
 *
 * Lo que se bloquea es la cuenta, no la conexión ni el equipo (CU-SEG-05). El
 * límite por IP contaba los intentos de todas las cuentas juntas, así que
 * probar tres contraseñas en tres cuentas distintas dejaba fuera al navegador
 * entero —y al de al lado, y al teléfono en la misma red—, incluso para quien
 * sabía su contraseña y no se había equivocado nunca. Peor: tapaba el aviso de
 * la cuenta bloqueada con uno sobre la conexión, que no le dice nada a quien
 * tiene que entender por qué no entra.
 *
 * La defensa es la escalada por cuenta: tres intentos, un minuto; tres más,
 * cinco minutos; tres más y solo el administrador reabre.
 */
router.post('/login', validarCuerpo(ctrl.esquemaLogin), ctrl.login);

/**
 * HU-02 Registro de cliente: ruta pública, sin autenticación previa.
 * Lleva el mismo límite porque también es un extremo abierto que se puede
 * usar para crear cuentas en masa.
 */
router.post('/registro', limiteDeIntentos, validarCuerpo(ctrl.esquemaRegistro), ctrl.registro);

/**
 * HU-06 «Olvidé mi contraseña». Pedir códigos tiene su propio límite por IP
 * (la respuesta es siempre la misma, así que el de intentos fallidos no lo
 * vería); verificar y restablecer llevan el de intentos fallidos, además de
 * los cinco intentos de cada código.
 */
router.post('/recuperar', limiteDeSolicitudes, validarCuerpo(esquemaSolicitarCodigo), ctrl.solicitarCodigo);
router.post('/recuperar/verificar', limiteDeIntentos, validarCuerpo(esquemaVerificarCodigo), ctrl.verificarCodigo);
router.post(
  '/recuperar/restablecer',
  limiteDeIntentos,
  validarCuerpo(esquemaRestablecerContrasena),
  ctrl.restablecerContrasena,
);

/**
 * Clave pública con que los demás microservicios verifican los tokens
 * (RS256). Es pública a propósito: con ella no se puede firmar.
 */
router.get('/clave-publica', ctrl.clavePublica);
router.post('/logout', requiereAutenticacion, ctrl.logout);
router.get('/perfil', requiereAutenticacion, ctrl.perfil);

export default router;
