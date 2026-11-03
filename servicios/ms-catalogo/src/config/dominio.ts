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
