import { describe, it, expect } from 'vitest';
import {
  acumular,
  agruparEnElTiempo,
  diaDe,
  esPorMes,
  extremos,
  histograma,
  pareto,
  percentil,
  porDiaDeLaSemana,
  ranking,
} from '@/lib/series';

/**
 * Los cálculos de los gráficos de los reportes. Un gráfico que suma mal se ve
 * igual de bonito: por eso se prueban los números, no el dibujo.
 */

const ceros = { total: 0, ventas: 0 };

describe('agruparEnElTiempo', () => {
  it('suma por día y rellena con cero los días sin ventas', () => {
    const puntos = agruparEnElTiempo(
      '2026-11-01',
      '2026-11-04',
      [
        { dia: '2026-11-01', valores: { total: 10, ventas: 1 } },
        { dia: '2026-11-01', valores: { total: 5, ventas: 1 } },
        { dia: '2026-11-04', valores: { total: 7, ventas: 1 } },
      ],
      ceros,
    );

    expect(puntos.map((p) => p.clave)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
    expect(puntos.map((p) => p.total)).toEqual([15, 0, 0, 7]);
    expect(puntos[0].ventas).toBe(2);
    expect(esPorMes(puntos)).toBe(false);
  });

  it('con un rango de más de dos meses agrupa por mes', () => {
    const puntos = agruparEnElTiempo(
      '2026-01-15',
      '2026-04-10',
      [
        { dia: '2026-01-20', valores: { total: 3, ventas: 1 } },
        { dia: '2026-03-02', valores: { total: 4, ventas: 1 } },
        { dia: '2026-03-30', valores: { total: 6, ventas: 1 } },
      ],
      ceros,
    );

    expect(esPorMes(puntos)).toBe(true);
    expect(puntos.map((p) => p.clave)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(puntos.map((p) => p.total)).toEqual([3, 0, 10, 0]);
  });

  it('lo que cae fuera del rango no se dibuja', () => {
    const puntos = agruparEnElTiempo(
      '2026-11-01',
      '2026-11-02',
      [{ dia: '2026-11-09', valores: { total: 99, ventas: 1 } }],
      ceros,
    );

    expect(puntos.map((p) => p.total)).toEqual([0, 0]);
  });

  it('sin un rango válido usa el que cubren los datos', () => {
    const puntos = agruparEnElTiempo(
      '',
      '',
      [
        { dia: '2026-11-03', valores: { total: 1, ventas: 1 } },
        { dia: '2026-11-05', valores: { total: 2, ventas: 1 } },
      ],
      ceros,
    );

    expect(puntos.map((p) => p.clave)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05']);
    expect(agruparEnElTiempo('', '', [], ceros)).toEqual([]);
  });
});

describe('diaDe', () => {
  it('deja igual un día suelto y pasa un instante al día local', () => {
    expect(diaDe('2026-11-25')).toBe('2026-11-25');
    const instante = new Date(2026, 10, 25, 22, 30); // 22:30 del 25, hora local
    expect(diaDe(instante.toISOString())).toBe('2026-11-25');
  });
});

const barras = (valores: number[]) => valores.map((valor, i) => ({ nombre: `P${i + 1}`, valor }));

describe('ranking', () => {
  it('ordena de mayor a menor', () => {
    expect(ranking(barras([2, 9, 5])).map((b) => b.valor)).toEqual([9, 5, 2]);
  });

  it('suma en «Otros» los que no entran', () => {
    const resultado = ranking(barras([1, 2, 3, 4, 5]), 3);

    expect(resultado.map((b) => b.nombre)).toEqual(['P5', 'P4', 'Otros (3)']);
    expect(resultado[2]).toMatchObject({ valor: 6, otros: true });
  });
});

describe('extremos', () => {
  it('con muchas, deja las que más ganan y las que más pierden', () => {
    const resultado = extremos(barras([10, 8, 6, 4, 2, -1, -3, -5]), 5);

    // Dos arriba, «Otros» con las del medio y dos abajo: las pérdidas no se esconden.
    expect(resultado.map((b) => b.valor)).toEqual([10, 8, 11, -3, -5]);
    expect(resultado[2]).toMatchObject({ nombre: 'Otros (4)', otros: true });
  });

  it('con pocas las deja todas', () => {
    expect(extremos(barras([1, -2, 3])).map((b) => b.valor)).toEqual([3, 1, -2]);
  });
});

describe('acumular (ojiva)', () => {
  it('suma lo de cada punto y dice qué parte del total lleva', () => {
    const puntos = acumular([{ v: 10 }, { v: 30 }, { v: 0 }, { v: 60 }], (p) => p.v);

    expect(puntos.map((p) => p.acumulado)).toEqual([10, 40, 40, 100]);
    expect(puntos.map((p) => p.porcentaje)).toEqual([10, 40, 40, 100]);
  });
});

describe('pareto (ABC)', () => {
  it('ordena, acumula y clasifica: A hasta el 80 %, B hasta el 95 %, C el resto', () => {
    const resultado = pareto(barras([50, 25, 10, 8, 4, 3]));

    expect(resultado.map((b) => b.porcentaje)).toEqual([50, 25, 10, 8, 4, 3]);
    expect(resultado.map((b) => b.acumulado)).toEqual([50, 75, 85, 93, 97, 100]);
    // El que cruza el 80 % (empieza en 75) también es A.
    expect(resultado.map((b) => b.clase)).toEqual(['A', 'A', 'A', 'B', 'B', 'C']);
  });

  it('lo que no entra va en «Otros», al final y como C', () => {
    const resultado = pareto(barras([40, 30, 20, 5, 3, 2]), 4);

    expect(resultado.map((b) => b.nombre)).toEqual(['P1', 'P2', 'P3', 'Otros (3)']);
    expect(resultado[3]).toMatchObject({ valor: 10, clase: 'C' });
  });
});

describe('histograma (regla de Sturges)', () => {
  // Minutos de entrega de 20 pedidos.
  const minutos = [22, 25, 27, 28, 30, 31, 33, 33, 35, 36, 38, 40, 41, 43, 45, 48, 52, 55, 61, 64];

  it('arma k = 1 + 3,322·log n clases de ancho redondeado y cuenta cada valor una vez', () => {
    const { clases, ancho, k } = histograma(minutos, 5);

    expect(k).toBe(6); // 1 + 3,322·log10(20) = 5,32 → 6
    expect(ancho).toBe(10); // (64 − 22) / 6 = 7 → redondeado a 10
    expect(clases.map((c) => c.etiqueta)).toEqual(['20–30', '30–40', '40–50', '50–60', '60–70']);
    expect(clases.map((c) => c.frecuencia)).toEqual([4, 7, 5, 2, 2]);
    expect(clases.reduce((s, c) => s + c.frecuencia, 0)).toBe(minutos.length);
    expect(clases.at(-1)).toMatchObject({ acumulada: 20, porcentajeAcumulado: 100 });
    expect(clases[0].marca).toBe(25);
  });

  it('la mediana se lee en la ojiva, interpolando dentro de su clase', () => {
    const { clases } = histograma(minutos, 5);

    // 50 % cae en 30–40: 20 % antes, 55 % al terminar → 30 + (30/35)·10 ≈ 38,6
    expect(percentil(clases, 50)).toBe(38.6);
    expect(percentil([], 50)).toBeNull();
  });

  it('sin valores no inventa clases', () => {
    expect(histograma([]).clases).toEqual([]);
  });
});

describe('porDiaDeLaSemana', () => {
  it('promedia cada día entre cuántas veces aparece en el rango', () => {
    // Del lunes 2 al domingo 15 de noviembre de 2026: dos de cada día.
    const semana = porDiaDeLaSemana('2026-11-02', '2026-11-15', [
      { dia: '2026-11-02', total: 100, cantidad: 2 },
      { dia: '2026-11-09', total: 50, cantidad: 1 },
      { dia: '2026-11-14', total: 80, cantidad: 4 },
    ]);

    expect(semana.map((d) => d.corto)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
    expect(semana.every((d) => d.veces === 2)).toBe(true);
    expect(semana[0]).toMatchObject({ dia: 'Lunes', promedio: 75, cantidadPromedio: 1.5 });
    expect(semana[5]).toMatchObject({ dia: 'Sábado', promedio: 40 });
    expect(semana[1].promedio).toBe(0);
  });
});
