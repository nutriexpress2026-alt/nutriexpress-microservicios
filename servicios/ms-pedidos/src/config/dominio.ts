/**
 * Vocabulario del pedido (RF-PED-05). Los valores son los de las restricciones
 * CHECK de `prisma/esquema.sql`, iguales a los del sistema anterior para que el
 * frontend reutilizado los reconozca.
 */

export const ESTADOS_PEDIDO = [
  // HU-26: un pedido pagado en línea no entra a la cocina antes de que el dinero esté.
  'Pendiente de pago',
  'Recibido',
  'En preparacion',
  'En camino',
  'Entregado',
  'Cancelado',
] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'QR'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ESTADOS_PAGO_PEDIDO = ['Pendiente', 'Pagado', 'Vencido'] as const;

/** Por qué terminó cancelado: no es lo mismo que lo anule el cliente que se venza su pago. */
export const MOTIVOS_CANCELACION = ['Cliente', 'No entregado', 'Sin pago'] as const;
export type MotivoCancelacion = (typeof MOTIVOS_CANCELACION)[number];

/** HU-25 · El cliente puede cancelar mientras el pedido no haya salido a reparto. */
export const ESTADOS_CANCELABLES: EstadoPedido[] = ['Pendiente de pago', 'Recibido', 'En preparacion'];
export const esCancelable = (estado: EstadoPedido) => ESTADOS_CANCELABLES.includes(estado);

/** El efectivo se cobra en la puerta; el QR y la tarjeta, en la pasarela (ms-pagos). */
export const requiereCobroEnLinea = (metodo: MetodoPago) => metodo !== 'Efectivo';

/** El rol del portal. Solo un cliente tiene direcciones y pedidos propios. */
export const ROL_CLIENTE = 'Cliente';
