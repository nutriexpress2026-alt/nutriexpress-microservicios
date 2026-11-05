/**
 * Vocabulario de los cobros (RF-PAG-01, RF-PAG-02, HU-26, HU-27). Los valores son
 * los de las restricciones CHECK de `prisma/esquema.sql`.
 */

export const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'QR'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ESTADOS_PAGO = ['Pendiente', 'Pagado', 'Fallido', 'Vencido', 'Reembolsado'] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

/** HU-27: simulado (demostraciones, no mueve dinero) o real (Libélula). */
export const MODOS_COBRO = ['Simulado', 'Real'] as const;
export type ModoCobro = (typeof MODOS_COBRO)[number];

/** Desenlaces de un cobro: después de uno de estos, el cobro ya no cambia. */
export const esPagoFinal = (estado: EstadoPago) => estado !== 'Pendiente';

/** El efectivo se cobra en mano; el QR y la tarjeta, en la pasarela. */
export const requiereCobroEnLinea = (metodo: MetodoPago) => metodo !== 'Efectivo';
