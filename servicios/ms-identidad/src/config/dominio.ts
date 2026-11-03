/**
 * Valores de dominio de ms-identidad (los estados de pedido, motivos de
 * inventario, etc. viven en el microservicio dueño de cada uno).
 */
/**
 * Reglas de dominio que no pertenecen a ninguna capa técnica.
 *
 * El modelo de clases define Usuario como supertipo, con Empleado y Cliente
 * como especializaciones. Todo usuario debe materializarse en exactamente una
 * de las dos tablas de subtipo; de lo contrario no puede participar en ventas,
 * pedidos, notas de inventario ni órdenes de producción, porque siete claves
 * foráneas del esquema apuntan a `empleado` o a `cliente`.
 */

/** Rol que identifica a un actor externo del portal de pedidos. */
export const ROL_CLIENTE = 'Cliente';

/** Un usuario es personal interno cuando su rol no es el de cliente. */
export function esPersonalInterno(nombreRol: string): boolean {
  return nombreRol !== ROL_CLIENTE;
}

/**
 * Único cargo habilitado para repartir pedidos.
 * CU-PED-02, excepciones: "Solo pueden asignarse como repartidores los
 * empleados con cargo Repartidor."
 */
export const CARGO_REPARTIDOR = 'Repartidor';
