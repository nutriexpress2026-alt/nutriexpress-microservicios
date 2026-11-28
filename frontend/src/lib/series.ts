/**
 * Cálculos de los gráficos de los reportes: series en el tiempo y rankings.
 *
 * Son funciones puras (sin React) para poder probarlas solas: un gráfico que
 * dibuja mal los datos se ve bonito igual, y el error no lo nota nadie.
 */

import { fechaIsoLocal } from './formato';

/** Más días que esto ya no caben como columnas legibles: se agrupa por mes. */
export const MAXIMO_DIAS = 62;

/** Un período de una serie en el tiempo: el día o el mes y lo que sumó. */
export type PuntoTiempo<V extends Record<string, number>> = V & {
  /** «2026-11-25» o «2026-11». */
  clave: string;
  /** Corta, para el eje: «25 nov» o «nov 26». */
  etiqueta: string;
  /** Larga, para el recuadro al pasar el ratón: «martes, 25 de noviembre». */
  etiquetaLarga: string;
};

/** «2026-11-25» como fecha local (`new Date('2026-11-25')` sería medianoche de Greenwich). */
function diaLocal(iso: string): Date {
  const [anio, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

const esDia = (texto: string) => /^\d{4}-\d{2}-\d{2}$/.test(texto);

/**
 * El día de un registro en la hora de quien mira. Acepta un día suelto
 * («2026-11-25», como lo manda ms-reportes en `porDia`) o un instante completo
 * («2026-11-26T01:30:00Z», que en Bolivia todavía es el 25).
 */
export function diaDe(fecha: string): string {
  return esDia(fecha) ? fecha : fechaIsoLocal(new Date(fecha));
}

const formatoDia = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short' });
const formatoDiaLargo = new Intl.DateTimeFormat('es-BO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const formatoMes = new Intl.DateTimeFormat('es-BO', { month: 'short', year: '2-digit' });
const formatoMesLargo = new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric' });

/**
 * Suma los registros por día (o por mes, si el rango pasa de `MAXIMO_DIAS`) y
 * rellena con ceros los períodos sin movimiento.
 *
 * Los ceros importan: sin ellos, un gráfico con ventas el lunes y el viernes
 * pone las dos columnas juntas y parece que se vendió todos los días.
 */
export function agruparEnElTiempo<V extends Record<string, number>>(
  desde: string,
  hasta: string,
  registros: { dia: string; valores: Partial<V> }[],
  ceros: V,
): PuntoTiempo<V>[] {
  let inicio = esDia(desde) ? diaLocal(desde) : null;
  let fin = esDia(hasta) ? diaLocal(hasta) : null;

  // Sin un rango válido, el que cubren los datos.
  if (!inicio || !fin || inicio > fin) {
    const dias = registros.map((r) => r.dia).filter(esDia).sort();
    if (dias.length === 0) return [];
    inicio = diaLocal(dias[0]);
    fin = diaLocal(dias[dias.length - 1]);
  }

  const totalDias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;
  const porMes = totalDias > MAXIMO_DIAS;
  const claveDe = (dia: string) => (porMes ? dia.slice(0, 7) : dia);

  const puntos = new Map<string, PuntoTiempo<V>>();
  const cursor = new Date(inicio);
  while (cursor <= fin) {
    const dia = fechaIsoLocal(cursor);
    const clave = claveDe(dia);
    if (!puntos.has(clave)) {
      puntos.set(clave, {
        ...ceros,
        clave,
        etiqueta: porMes ? formatoMes.format(cursor) : formatoDia.format(cursor),
        etiquetaLarga: porMes ? formatoMesLargo.format(cursor) : formatoDiaLargo.format(cursor),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const { dia, valores } of registros) {
    // Fuera del rango no se dibuja: el eje es el período que se consultó.
    const punto = puntos.get(claveDe(dia));
    if (!punto) continue;
    for (const [nombre, valor] of Object.entries(valores) as [keyof V & string, number][]) {
      (punto as Record<string, number>)[nombre] += valor ?? 0;
    }
  }

  return [...puntos.values()];
}

/** Si la serie quedó agrupada por mes (el rango pasó de `MAXIMO_DIAS`). */
export const esPorMes = (puntos: { clave: string }[]) => puntos[0]?.clave.length === 7;

/** «1 venta», «3 ventas». */
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Una barra de un ranking: un producto, un insumo, un vendedor. */
export interface BarraRanking {
  nombre: string;
  valor: number;
  /** Líneas extra para el recuadro al pasar el ratón («12 unidades»). */
  detalle?: string[];
  /** Es la suma de los que no entraron en el gráfico. */
  otros?: boolean;
}

/** La suma de los que no entraron, en una sola barra al final. */
function barraOtros(resto: BarraRanking[]): BarraRanking {
  return {
    nombre: `Otros (${resto.length})`,
    valor: Math.round(resto.reduce((s, b) => s + b.valor, 0) * 100) / 100,
    detalle: [`La suma de ${resto.length} más; cada uno está en la tabla`],
    otros: true,
  };
}

/**
 * De mayor a menor, con los que no entran sumados en «Otros».
 *
 * Más de ocho barras ya no se comparan de un vistazo; el detalle completo
 * sigue en la vista de tabla.
 */
export function ranking(barras: BarraRanking[], maximo = 8): BarraRanking[] {
  const ordenadas = [...barras].sort((a, b) => b.valor - a.valor);
  if (ordenadas.length <= maximo) return ordenadas;
  return [...ordenadas.slice(0, maximo - 1), barraOtros(ordenadas.slice(maximo - 1))];
}

/**
 * De mayor a menor, pero cuando son muchas se quedan **las dos puntas**: las
 * que más dejan y las que más pierden, con las del medio en «Otros».
 *
 * Para la ganancia, cortar por arriba escondería justo las pérdidas, que son lo
 * que el dueño necesita ver.
 */
export function extremos(barras: BarraRanking[], maximo = 10): BarraRanking[] {
  const ordenadas = [...barras].sort((a, b) => b.valor - a.valor);
  if (ordenadas.length <= maximo) return ordenadas;
  const mitad = Math.floor((maximo - 1) / 2);
  const arriba = ordenadas.slice(0, mitad);
  const abajo = ordenadas.slice(ordenadas.length - (maximo - 1 - mitad));
  const medio = ordenadas.slice(mitad, ordenadas.length - abajo.length);
  return [...arriba, barraOtros(medio), ...abajo];
}
