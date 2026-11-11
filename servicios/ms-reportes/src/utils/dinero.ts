/** Redondeo a dos decimales en cada paso: así la suma de las partes da el total. */
export const dosDecimales = (valor: number) => Math.round(valor * 100) / 100;

/** Un importe como lo lee una persona en Bolivia: «Bs 1.234,50» (igual que la interfaz). */
export const bolivianos = (monto: number) =>
  `Bs ${monto.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatearPorcentaje = (valor: number) =>
  `${valor.toLocaleString('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
