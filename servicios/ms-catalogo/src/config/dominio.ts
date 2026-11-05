/**
 * Valores de dominio de ms-catalogo. Cada lista corresponde a un CHECK de
 * prisma/esquema.sql: si se agrega un valor, cambiar los dos.
 */

/**
 * Valores admitidos por la restricción `ck_almacen_tipo` del esquema.
 *
 * CU-INV-02: "El tipo de conservación determina qué insumos y productos pueden
 * almacenarse en cada almacén. Al no existir traspasos entre almacenes, cada
 * insumo y producto permanece en el almacén que corresponde a su condición."
 */
export const TIPOS_CONSERVACION = ['Seco', 'Refrigerado'] as const;

export type TipoConservacion = (typeof TIPOS_CONSERVACION)[number];

/**
 * Formatos admitidos para la foto de un producto (`ck_producto_imagen_tipo`).
 *
 * Es la lista contra la que se compara el tipo **real** del archivo —los
 * primeros bytes, no la cabecera `Content-Type` que manda el navegador y que
 * cualquiera puede falsificar (`utils/imagen.ts`).
 */
export const TIPOS_IMAGEN_PRODUCTO = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type TipoImagenProducto = (typeof TIPOS_IMAGEN_PRODUCTO)[number];

/** Tamaño máximo admitido para la foto de un producto. */
export const TAMANO_MAXIMO_IMAGEN_PRODUCTO = 3 * 1024 * 1024;

/* Ciclo de vida de la orden de producción (HU-10) */

/** Valores admitidos por la restricción `ck_ordprod_estado` del esquema. */
export const ESTADOS_ORDEN = ['Pendiente', 'En proceso', 'Finalizada', 'Cancelada'] as const;

export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];

/**
 * CU-PRO-02: "El estado de la orden evoluciona según el flujo: Pendiente, En
 * proceso y Finalizada." La cancelación no figura en la tabla porque es otro
 * caso de uso —CU-PRO-04, que extiende a este— y tiene su propia condición.
 */
export const FLUJO_ORDEN: Record<EstadoOrden, EstadoOrden[]> = {
  Pendiente: ['En proceso'],
  'En proceso': ['Finalizada'],
  Finalizada: [],
  Cancelada: [],
};

/** CU-PRO-04: se cancela mientras esté Pendiente o En proceso. */
export const ESTADOS_ORDEN_CANCELABLES: EstadoOrden[] = ['Pendiente', 'En proceso'];
