/**
 * Los límites de un día del calendario en la hora local (TZ = America/La_Paz,
 * config/env.ts): una venta de las 23:30 es de ese día y no del siguiente.
 */
export function limitesDelDia(fecha: string, fin: boolean): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return fin ? new Date(anio, mes - 1, dia, 23, 59, 59, 999) : new Date(anio, mes - 1, dia, 0, 0, 0, 0);
}

export const rangoDelPeriodo = (filtro: { desde: string; hasta: string }) => ({
  desde: limitesDelDia(filtro.desde, false),
  hasta: limitesDelDia(filtro.hasta, true),
});

/** «2026-11-12» en la hora local, para agrupar por día. */
export const diaLocal = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
