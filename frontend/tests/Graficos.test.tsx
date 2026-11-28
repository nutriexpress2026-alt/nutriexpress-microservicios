import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BarraRepartida, ListaAvance, TarjetaGrafico, colorMetodoPago } from '@/components/reportes/Graficos';
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

describe('BarraRepartida', () => {
  const partes = [
    { nombre: 'QR', valor: 75, color: colorMetodoPago('QR'), detalle: '3 ventas' },
    { nombre: 'Efectivo', valor: 25, color: colorMetodoPago('Efectivo'), detalle: '1 venta' },
  ];

  it('escribe el porcentaje en cada parte y el monto en la leyenda', () => {
    render(<BarraRepartida partes={partes} formatear={formatearBs} etiqueta="Métodos de pago" />);

    expect(screen.getByText('75 %')).toBeInTheDocument();
    expect(screen.getByText('25 %')).toBeInTheDocument();
    expect(screen.getByText('Bs 75,00')).toBeInTheDocument();
    expect(screen.getByText('3 ventas')).toBeInTheDocument();
    // Con el teclado o un lector de pantalla, cada parte dice su nombre y su monto.
    // (Intl separa «Bs» del número con un espacio duro: \s lo reconoce.)
    expect(screen.getByRole('img', { name: /QR: Bs\s75,00, 75,0\s%/ })).toBeInTheDocument();
  });

  it('cada método conserva su color aunque cambie el orden', () => {
    expect(colorMetodoPago('QR')).not.toBe(colorMetodoPago('Efectivo'));
    expect(colorMetodoPago('QR')).toBe(colorMetodoPago('QR'));
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
