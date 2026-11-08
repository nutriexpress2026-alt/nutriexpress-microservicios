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

/**
 * HU-23 · Flujo de estados que hace avanzar el personal (RF-PED-05). «Pendiente de
 * pago» no lo mueve nadie: sale cuando el cobro se confirma o vence. Un pedido en
 * camino termina Entregado o Cancelado («No entregado»).
 */
export const FLUJO_DE_ESTADOS: Record<EstadoPedido, EstadoPedido[]> = {
  'Pendiente de pago': [],
  Recibido: ['En preparacion'],
  'En preparacion': ['En camino'],
  'En camino': ['Entregado', 'Cancelado'],
  Entregado: [],
  Cancelado: [],
};
export const transicionesPosibles = (origen: EstadoPedido) => FLUJO_DE_ESTADOS[origen];
export const esTransicionValida = (origen: EstadoPedido, destino: EstadoPedido) => FLUJO_DE_ESTADOS[origen].includes(destino);

/** Los estados en que un pedido ocupa a su repartidor (cuenta para repartir la carga). */
export const ESTADOS_OCUPAN_REPARTIDOR: EstadoPedido[] = ['Recibido', 'En preparacion', 'En camino'];

/** RF-PED-04 · Único cargo al que se le asignan pedidos. */
export const CARGO_REPARTIDOR = 'Repartidor';

/** El efectivo se cobra en la puerta; el QR y la tarjeta, en la pasarela (ms-pagos). */
export const requiereCobroEnLinea = (metodo: MetodoPago) => metodo !== 'Efectivo';

/** El rol del portal. Solo un cliente tiene direcciones y pedidos propios. */
export const ROL_CLIENTE = 'Cliente';
