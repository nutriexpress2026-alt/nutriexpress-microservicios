import type { Request, Response } from 'express';
import * as pagoService from '../services/pago.service.js';
import * as configService from '../services/configuracion.service.js';
import { esquemaCambiarModo, esquemaFiltroPagos } from '../dtos/pago.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/** Capa Controller — solo traduce HTTP; ninguna regla de negocio vive aquí. */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroPagos.safeParse(req.query);
  if (!filtro.success) throw new ErrorApp(400, 'Filtro de cobros inválido');
  res.json(await pagoService.listar(filtro.data));
}

export async function obtener(req: Request, res: Response) {
  res.json(await pagoService.obtener(Number(req.params.id)));
}

export async function confirmarManual(req: Request, res: Response) {
  res.json(await pagoService.confirmarManual(req.sesion!, Number(req.params.id)));
}

export async function anular(req: Request, res: Response) {
  res.json(await pagoService.anular(req.sesion!, Number(req.params.id)));
}

export async function vencerPendientes(_req: Request, res: Response) {
  res.json({ vencidos: await pagoService.vencerPendientes() });
}

/**
 * RF-PAG-02 · Aviso de la pasarela (webhook). Se responde 200 aunque el aviso no
 * corresponda a ningún cobro conocido: una pasarela que recibe un error reintenta
 * durante horas algo que nunca se va a poder procesar. Los de firma, 401.
 */
export async function recibirAviso(req: Request, res: Response) {
  // Un aviso por GET no trae cuerpo: express.raw deja req.body sin definir.
  const cuerpoCrudo = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : req.body === undefined
      ? ''
      : JSON.stringify(req.body);

  // Constancia de cada aviso antes de validarlo; el testigo no se escribe.
  const { testigo: _testigo, ...visibles } = req.query as Record<string, unknown>;
  console.log(
    `[pagos] Aviso recibido por ${req.method}:`,
    JSON.stringify(visibles),
    cuerpoCrudo.trim() ? `cuerpo: ${cuerpoCrudo.slice(0, 300)}` : '(sin cuerpo)',
  );

  // Libélula no envía cabeceras propias: lo que autentica el aviso viaja en la dirección.
  const testigo = typeof req.query.testigo === 'string' ? req.query.testigo : undefined;
  const referencia = typeof req.query.ref === 'string' ? req.query.ref : undefined;
  res.json(
    await pagoService.procesarAviso(
      cuerpoCrudo,
      {
        ...(req.headers as Record<string, string | undefined>),
        ...(testigo ? { 'x-testigo-pago': testigo } : {}),
        ...(referencia ? { 'x-referencia-pago': referencia } : {}),
      },
      req.query as Record<string, unknown>,
    ),
  );
}

/* --- HU-27 · Modo de cobro (solo administrador) --- */

export async function estadoCobro(_req: Request, res: Response) {
  res.json(await configService.estadoCobro());
}

export async function cambiarModo(req: Request, res: Response) {
  const { modo } = esquemaCambiarModo.parse(req.body);
  res.json(await configService.cambiarModoCobro(req.sesion!, modo));
}
