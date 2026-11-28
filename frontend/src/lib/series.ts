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

/* ------------------------------------------------------------------ */
/* Ojiva: lo acumulado                                                 */
/* ------------------------------------------------------------------ */

/**
 * Cada punto con lo acumulado hasta él y qué porcentaje del total es: la ojiva
 * (curva de frecuencias acumuladas).
 */
export function acumular<T>(
  puntos: T[],
  valor: (punto: T) => number,
): (T & { acumulado: number; porcentaje: number })[] {
  const total = puntos.reduce((s, p) => s + valor(p), 0);
  let acumulado = 0;
  return puntos.map((p) => {
    acumulado += valor(p);
    return {
      ...p,
      acumulado: Math.round(acumulado * 100) / 100,
      porcentaje: total > 0 ? Math.round((acumulado / total) * 1000) / 10 : 0,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Pareto y clasificación ABC                                          */
/* ------------------------------------------------------------------ */

export type ClaseAbc = 'A' | 'B' | 'C';

export interface BarraPareto extends BarraRanking {
  /** Su parte del total, en porcentaje. */
  porcentaje: number;
  /** Lo acumulado hasta ella, en porcentaje (la línea del diagrama). */
  acumulado: number;
  /** A: hasta el 80 % del total; B: hasta el 95 %; C: el resto. */
  clase: ClaseAbc;
}

/**
 * Diagrama de Pareto con la clasificación ABC: de mayor a menor, cada uno con
 * su porcentaje y el acumulado.
 *
 * Es clase A el que todavía empieza antes del 80 % (el que cruza la línea
 * también es A); B hasta el 95 %; C el resto. Los que no entran en el gráfico
 * se suman en «Otros», al final, y son C.
 */
export function pareto(barras: BarraRanking[], maximo = 12): BarraPareto[] {
  const ordenadas = [...barras].filter((b) => b.valor > 0).sort((a, b) => b.valor - a.valor);
  const visibles =
    ordenadas.length <= maximo
      ? ordenadas
      : [...ordenadas.slice(0, maximo - 1), barraOtros(ordenadas.slice(maximo - 1))];
  const total = visibles.reduce((s, b) => s + b.valor, 0);
  let acumulado = 0;
  return visibles.map((b) => {
    const antes = acumulado;
    acumulado += total > 0 ? (b.valor / total) * 100 : 0;
    return {
      ...b,
      porcentaje: Math.round((total > 0 ? (b.valor / total) * 100 : 0) * 10) / 10,
      acumulado: Math.round(acumulado * 10) / 10,
      clase: b.otros ? 'C' : antes < 80 ? 'A' : antes < 95 ? 'B' : 'C',
    };
  });
}

/* ------------------------------------------------------------------ */
/* Histograma (regla de Sturges)                                       */
/* ------------------------------------------------------------------ */

/** Una clase (intervalo) del histograma. */
export interface ClaseHistograma {
  desde: number;
  hasta: number;
  /** El punto medio: por donde pasa el polígono de frecuencias. */
  marca: number;
  /** «20–30». */
  etiqueta: string;
  frecuencia: number;
  /** Frecuencia relativa, en porcentaje. */
  relativa: number;
  /** Frecuencia acumulada (para la ojiva). */
  acumulada: number;
  porcentajeAcumulado: number;
}

/**
 * Agrupa los valores en clases de igual ancho.
 *
 * El número de clases sale de la **regla de Sturges** (k = 1 + 3,322·log₁₀ n)
 * y el ancho se redondea hacia arriba a un número cómodo de leer (de 5 en 5
 * minutos, por ejemplo). Cada clase incluye su límite inferior y no el
 * superior, salvo la última, que incluye el valor más alto.
 */
export function histograma(
  valores: number[],
  redondeo = 5,
): { clases: ClaseHistograma[]; ancho: number; k: number } {
  const n = valores.length;
  if (n === 0) return { clases: [], ancho: 0, k: 0 };

  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const k = Math.ceil(1 + 3.322 * Math.log10(n));
  const ancho = Math.max(Math.ceil((maximo - minimo) / k / redondeo) * redondeo, redondeo);
  const inicio = Math.floor(minimo / redondeo) * redondeo;

  const clases: ClaseHistograma[] = [];
  for (let desde = inicio; desde <= maximo; desde += ancho) {
    const hasta = desde + ancho;
    clases.push({
      desde,
      hasta,
      marca: desde + ancho / 2,
      etiqueta: `${desde}–${hasta}`,
      frecuencia: 0,
      relativa: 0,
      acumulada: 0,
      porcentajeAcumulado: 0,
    });
  }
  for (const v of valores) {
    const i = Math.min(Math.floor((v - inicio) / ancho), clases.length - 1);
    clases[i].frecuencia += 1;
  }
  let acumulada = 0;
  for (const c of clases) {
    acumulada += c.frecuencia;
    c.relativa = Math.round((c.frecuencia / n) * 1000) / 10;
    c.acumulada = acumulada;
    c.porcentajeAcumulado = Math.round((acumulada / n) * 1000) / 10;
  }
  return { clases, ancho, k };
}

/**
 * El valor bajo el que queda el `p` % de los datos, leído en la ojiva por
 * interpolación lineal dentro de su clase (con `p` = 50, la mediana).
 */
export function percentil(clases: ClaseHistograma[], p: number): number | null {
  let previo = 0;
  for (const c of clases) {
    if (c.porcentajeAcumulado >= p && c.frecuencia > 0) {
      const dentro = (p - previo) / (c.porcentajeAcumulado - previo);
      return Math.round((c.desde + dentro * (c.hasta - c.desde)) * 10) / 10;
    }
    previo = c.porcentajeAcumulado;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Días de la semana                                                   */
/* ------------------------------------------------------------------ */

const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/**
 * El promedio de cada día de la semana en el rango.
 *
 * Promedio y no suma: un mes puede tener cinco sábados y cuatro lunes, y la
 * suma haría parecer que el sábado vende más solo por eso. Se divide entre
 * cuántos de ese día **tiene el rango**, hayan tenido ventas o no.
 */
export function porDiaDeLaSemana(
  desde: string,
  hasta: string,
  dias: { dia: string; total: number; cantidad: number }[],
): { dia: string; corto: string; promedio: number; cantidadPromedio: number; veces: number }[] {
  let inicio = esDia(desde) ? diaLocal(desde) : null;
  let fin = esDia(hasta) ? diaLocal(hasta) : null;
  if (!inicio || !fin || inicio > fin) {
    const ordenados = dias.map((d) => d.dia).filter(esDia).sort();
    if (ordenados.length === 0) return [];
    inicio = diaLocal(ordenados[0]);
    fin = diaLocal(ordenados[ordenados.length - 1]);
  }

  // getDay(): 0 es domingo; aquí la semana empieza el lunes.
  const indice = (fecha: Date) => (fecha.getDay() + 6) % 7;
  const veces = Array(7).fill(0);
  for (const cursor = new Date(inicio); cursor <= fin; cursor.setDate(cursor.getDate() + 1)) {
    veces[indice(cursor)] += 1;
  }
  const total = Array(7).fill(0);
  const cantidad = Array(7).fill(0);
  for (const d of dias) {
    if (!esDia(d.dia)) continue;
    const i = indice(diaLocal(d.dia));
    total[i] += d.total;
    cantidad[i] += d.cantidad;
  }
  return NOMBRES_DIA.map((dia, i) => ({
    dia,
    corto: dia.slice(0, 3),
    promedio: veces[i] ? Math.round((total[i] / veces[i]) * 100) / 100 : 0,
    cantidadPromedio: veces[i] ? Math.round((cantidad[i] / veces[i]) * 10) / 10 : 0,
    veces: veces[i],
  }));
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
