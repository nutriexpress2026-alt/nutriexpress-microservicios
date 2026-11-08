/**
 * Vocabulario de la venta de mostrador (RF-VEN-02, RF-VEN-03). Los valores son los
 * de las restricciones CHECK de `prisma/esquema.sql`, iguales a los del sistema
 * anterior para que el frontend reutilizado los reconozca.
 */

/** En mesa o para llevar. */
export const TIPOS_VENTA = ['Mesa', 'Llevar'] as const;
export type TipoVenta = (typeof TIPOS_VENTA)[number];

/** En el mostrador se cobra en efectivo o con QR: no hay terminal para tarjeta. */
export const METODOS_PAGO_VENTA = ['Efectivo', 'QR'] as const;
export type MetodoPagoVenta = (typeof METODOS_PAGO_VENTA)[number];

export const ESTADOS_PAGO_VENTA = ['Pendiente', 'Pagado', 'Anulado'] as const;
export type EstadoPagoVenta = (typeof ESTADOS_PAGO_VENTA)[number];
