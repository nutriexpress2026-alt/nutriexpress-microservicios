import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListaAvance, TarjetaGrafico, colorMetodoPago } from '@/components/reportes/Graficos';
import { Torta, partesConColor } from '@/components/reportes/GraficosEstadisticos';

// Recharts mide su contenedor con ResizeObserver, que jsdom no trae.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
import { TablaDatos } from '@/components/reportes/PiezasReporte';
import { formatearBs } from '@/lib/formato';

/**
 * Las piezas del tablero de los reportes. Los gráficos de Recharts necesitan
 * un navegador de verdad para medirse; aquí se prueba lo que los rodea: que
 * cada gráfico tenga su tabla y que las cifras estén escritas, no solo pintadas.
 */

describe('TarjetaGrafico', () => {
  it('muestra el gráfico y, con un botón, la misma información en tabla', async () => {
    render(
      <TarjetaGrafico
        titulo="¿Quién vendió más?"
        tabla={
          <TablaDatos
            filas={[{ nombre: 'Ana', total: 30 }]}
            clave={(f) => f.nombre}
            columnas={[
              { titulo: 'Vendedor', celda: (f) => f.nombre },
              { titulo: 'Total', numerica: true, celda: (f) => formatearBs(f.total) },
            ]}
          />
        }
      >
        <p>el gráfico</p>
      </TarjetaGrafico>,
    );

    expect(screen.getByText('el gráfico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gráfico/ })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: /Tabla/ }));

    expect(screen.queryByText('el gráfico')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Bs 30,00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tabla/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Torta', () => {
  const partes = [
    { nombre: 'QR', valor: 75, color: colorMetodoPago('QR'), detalle: '3 ventas' },
    { nombre: 'Efectivo', valor: 25, color: colorMetodoPago('Efectivo'), detalle: '1 venta' },
  ];

  it('deja escritos el total, el monto y el porcentaje de cada parte', () => {
    render(
      <Torta
        partes={partes}
        formatear={formatearBs}
        centro={{ valor: 'Bs 100,00', texto: 'cobrado' }}
        etiqueta="Métodos de pago"
      />,
    );

    expect(screen.getByRole('figure', { name: 'Métodos de pago' })).toBeInTheDocument();
    expect(screen.getByText('cobrado')).toBeInTheDocument();
    expect(screen.getByText('Bs 75,00')).toBeInTheDocument();
    // (Intl separa «Bs» y «%» con un espacio duro: \s lo reconoce.)
    expect(screen.getByText(/75,0\s%\s·\s3 ventas/)).toBeInTheDocument();
    expect(screen.getByText(/25,0\s%\s·\s1 venta/)).toBeInTheDocument();
  });

  it('cada método conserva su color aunque cambie el orden', () => {
    expect(colorMetodoPago('QR')).not.toBe(colorMetodoPago('Efectivo'));
    expect(colorMetodoPago('QR')).toBe(colorMetodoPago('QR'));
  });
});

describe('partesConColor', () => {
  it('da un color fijo a cada una y pasada la octava suma el resto en «Otros»', () => {
    const partes = partesConColor(
      Array.from({ length: 10 }, (_, i) => ({ nombre: `Insumo ${i + 1}`, valor: 100 - i })),
    );

    expect(partes).toHaveLength(8);
    expect(new Set(partes.map((p) => p.color)).size).toBe(8);
    expect(partes[7]).toMatchObject({ nombre: 'Otros (3)', valor: 93 + 92 + 91 });
  });
});

describe('ListaAvance', () => {
  it('cada repartidor se mide contra lo suyo y la cifra queda escrita', () => {
    render(
      <ListaAvance
        etiqueta="Entregas"
        filas={[{ nombre: 'Luis', hecho: 3, total: 4, cifra: '3 de 4 entregados' }]}
      />,
    );

    expect(screen.getByText('3 de 4 entregados')).toBeInTheDocument();
    const medidor = screen.getByRole('meter', { name: 'Luis' });
    expect(medidor).toHaveAttribute('aria-valuenow', '3');
    expect(medidor).toHaveAttribute('aria-valuemax', '4');
  });
});
