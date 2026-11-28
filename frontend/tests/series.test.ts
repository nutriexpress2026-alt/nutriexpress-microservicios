import { describe, it, expect } from 'vitest';
import { agruparEnElTiempo, diaDe, esPorMes, extremos, ranking } from '@/lib/series';

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
