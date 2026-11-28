'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RequierePermiso } from '@/components/RequierePermiso';
import { Selector } from '@/components/ui/Selector';
import { MarcoReporte } from '@/components/reportes/MarcoReporte';
import {
  Cifra,
  Cifras,
  TablaDatos,
  TablaReporte,
  type ColumnaTabla,
} from '@/components/reportes/PiezasReporte';
import { CifrasGanancia, columnasGanancia } from '@/components/reportes/Ganancia';
import {
  BarraRepartida,
  BarrasRanking,
  COLOR_MARCA,
  ColumnasEnElTiempo,
  Tablero,
  TarjetaGrafico,
  colorMetodoPago,
} from '@/components/reportes/Graficos';
import type { LineaProductoReporte, ProductoCatalogo, ReporteVentas } from '@/types';
import { formatearBs, formatearPorcentaje } from '@/lib/formato';
import { agruparEnElTiempo, esPorMes, extremos, plural, ranking } from '@/lib/series';

/**
 * RF-VEN-07 — reporte parametrizado de ventas por rango de fechas y producto,
 * exportable a PDF y enviable por correo electrónico.
 *
 * Es lo que convierte al sistema de *"registra datos"* en *"me dice cómo va el
 * negocio"*. Por eso lo primero que se ve son las cifras del resumen —cuánto se
 * vendió y cuánto se ganó—, y el detalle viene después: quien abre esta
 * pantalla quiere una respuesta, no una tabla. Filtrado por un producto, todo
 * es de ese producto, también la ganancia.
 *
 * El detalle se ve en gráficos (cómo fue cada día, qué se vende y qué deja
 * ganancia, cómo pagan, quién vende), cada uno con su tabla a un botón.
 */
export default function PaginaReportes() {
  return (
    <RequierePermiso permiso="VENTA_LEER">
      <Reportes />
    </RequierePermiso>
  );
}

function Reportes() {
  const [idProducto, setIdProducto] = useState<number | null>(null);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [idVendedor, setIdVendedor] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<{ id: number; nombre: string }[]>([]);

  useEffect(() => {
    // HU-28 · Los vendedores que vendieron alguna vez (los conoce ms-reportes).
    api
      .get<{ id: number; nombre: string }[]>('/reportes/ventas/vendedores')
      .then(setVendedores)
      .catch(() => {});
    api
      .get<ProductoCatalogo[]>('/catalogo')
      .then(setProductos)
      .catch(() => {
        // Sin la lista, el filtro por producto queda vacío y el reporte
        // general sigue funcionando. No vale interrumpir por eso.
      });
  }, []);

  return (
    <MarcoReporte<ReporteVentas>
      titulo="Reporte de ventas"
      descripcion="Cuánto se vendió, cuánto se ganó y por qué medio se cobró"
      recurso="ventas"
      filtros={{ idProducto: idProducto ?? undefined, idVendedor: idVendedor ?? undefined }}
      controles={
        // HU-28 · «Por fechas, producto y vendedor»: los dos filtros en su propia fila.
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
          <Selector<number>
            etiqueta="Producto"
            valor={idProducto}
            marcador="Todos los productos"
            onCambiar={(v) => setIdProducto(v === -1 ? null : v)}
            opciones={[
              { valor: -1, etiqueta: 'Todos los productos' },
              ...productos.map((p) => ({ valor: p.id, etiqueta: p.nombre })),
            ]}
          />
          <Selector<number>
            etiqueta="Vendedor"
            valor={idVendedor}
            marcador="Todos los vendedores"
            onCambiar={(v) => setIdVendedor(v === -1 ? null : v)}
            opciones={[
              { valor: -1, etiqueta: 'Todos los vendedores' },
              ...vendedores.map((v) => ({ valor: v.id, etiqueta: v.nombre })),
            ]}
          />
        </div>
      }
      vacio={(r) => r.resumen.cantidadVentas === 0}
      tituloVacio="Sin ventas en el período"
    >
      {(reporte) => (
        <>
          <Cifras>
            <Cifra etiqueta="Ventas" valor={String(reporte.resumen.cantidadVentas)} />
            <Cifra etiqueta="Unidades" valor={String(reporte.resumen.unidades)} />
            <Cifra etiqueta="Total" valor={formatearBs(reporte.resumen.total)} destacada />
            <Cifra
              etiqueta="Ticket promedio"
              valor={formatearBs(reporte.resumen.ticketPromedio)}
            />
          </Cifras>

          <CifrasGanancia ganancia={reporte.resumen} />

          {reporte.anuladas && reporte.anuladas.cantidad > 0 && (
            <p className="text-sm text-tinta-suave">
              {reporte.anuladas.cantidad} venta(s) anulada(s) por {formatearBs(reporte.anuladas.total)} no
              suman en el total.
            </p>
          )}

          <TableroVentas reporte={reporte} />
        </>
      )}
    </MarcoReporte>
  );
}

/**
 * Los gráficos del reporte, cada uno con su tabla al lado (botón «Tabla»).
 *
 * Un gráfico con una sola barra no dice más que la cifra: cuando el filtro deja
 * un solo producto o un solo vendedor, va la tabla directamente.
 */
function TableroVentas({ reporte }: { reporte: ReporteVentas }) {
  const dias = agruparEnElTiempo(
    reporte.desde,
    reporte.hasta,
    reporte.porDia.map((d) => ({
      dia: d.dia,
      valores: { total: d.total, cantidadVentas: d.cantidadVentas },
    })),
    { total: 0, cantidadVentas: 0 },
  );
  const periodo = esPorMes(dias) ? 'mes' : 'día';

  // Cada tabla se arma una vez: va en la vista «Tabla» de su gráfico o, si no
  // hay gráfico, sola.
  const productos = {
    filas: reporte.porProducto,
    clave: (p: LineaProductoReporte) => p.idProducto,
    columnas: [
      { titulo: 'Producto', celda: (p) => p.nombre },
      { titulo: 'Unidades', numerica: true, celda: (p) => p.unidades },
      { titulo: 'Importe', numerica: true, celda: (p) => formatearBs(p.importe) },
      {
        titulo: '% del total',
        numerica: true,
        celda: (p) => formatearPorcentaje(p.participacion),
      },
      ...columnasGanancia<LineaProductoReporte>(),
    ] as ColumnaTabla<LineaProductoReporte>[],
  };
  const conCosto = reporte.porProducto.filter((p) => p.ganancia !== null);

  type FilaVendedor = NonNullable<ReporteVentas['porVendedor']>[number];
  const vendedores = {
    filas: reporte.porVendedor ?? [],
    clave: (v: FilaVendedor) => v.idVendedor,
    columnas: [
      { titulo: 'Vendedor', celda: (v) => v.vendedor },
      { titulo: 'Ventas', numerica: true, celda: (v) => v.cantidadVentas },
      { titulo: 'Total', numerica: true, celda: (v) => formatearBs(v.total) },
    ] as ColumnaTabla<FilaVendedor>[],
  };

  type FilaMetodo = ReporteVentas['porMetodoPago'][number];
  const metodos = {
    filas: reporte.porMetodoPago,
    clave: (m: FilaMetodo) => m.metodo,
    columnas: [
      { titulo: 'Método', celda: (m) => m.metodo },
      { titulo: 'Ventas', numerica: true, celda: (m) => m.cantidadVentas },
      { titulo: 'Total', numerica: true, celda: (m) => formatearBs(m.total) },
    ] as ColumnaTabla<FilaMetodo>[],
  };

  return (
    <Tablero>
      <TarjetaGrafico
        ancho
        titulo={`¿Cuánto se vendió cada ${periodo}?`}
        descripcion={`Total cobrado por ${periodo}, en bolivianos. Los ${periodo === 'mes' ? 'meses' : 'días'} sin ventas quedan en cero`}
        tabla={
          <TablaDatos
            filas={dias.filter((d) => d.cantidadVentas > 0)}
            clave={(d) => d.clave}
            columnas={[
              { titulo: periodo === 'mes' ? 'Mes' : 'Día', celda: (d) => d.etiquetaLarga },
              { titulo: 'Ventas', numerica: true, celda: (d) => d.cantidadVentas },
              { titulo: 'Total', numerica: true, celda: (d) => formatearBs(d.total) },
            ]}
          />
        }
      >
        <ColumnasEnElTiempo
          datos={dias}
          series={[{ clave: 'total', nombre: 'vendido', color: COLOR_MARCA }]}
          formatear={formatearBs}
          notas={(d) => [plural(d.cantidadVentas, 'venta', 'ventas')]}
          etiqueta={`Columnas: total vendido por ${periodo}`}
        />
      </TarjetaGrafico>

      {reporte.porProducto.length > 1 ? (
        <TarjetaGrafico
          titulo="¿Qué productos se venden más?"
          descripcion="Lo cobrado por cada producto, en bolivianos"
          tabla={<TablaDatos {...productos} />}
        >
          <BarrasRanking
            barras={ranking(
              reporte.porProducto.map((p) => ({
                nombre: p.nombre,
                valor: p.importe,
                detalle: [
                  plural(p.unidades, 'unidad', 'unidades'),
                  `${formatearPorcentaje(p.participacion)} de lo vendido`,
                ],
              })),
            )}
            formatear={formatearBs}
            etiqueta="Barras: importe vendido por producto, de mayor a menor"
          />
        </TarjetaGrafico>
      ) : (
        // Siete columnas no caben en media pantalla: a lo ancho.
        <div className="lg:col-span-2">
          <TablaReporte titulo="Por producto" {...productos} />
        </div>
      )}

      {conCosto.length > 1 && (
        <TarjetaGrafico
          titulo="¿Qué productos dejan ganancia?"
          descripcion="Cobrado menos costo, en bolivianos. En rojo, lo vendido bajo su costo"
          tabla={<TablaDatos {...productos} />}
        >
          <BarrasRanking
            barras={extremos(
              conCosto.map((p) => ({
                nombre: p.nombre,
                valor: p.ganancia ?? 0,
                detalle: [
                  `Cobrado ${formatearBs(p.importe)}`,
                  `Costó ${formatearBs(p.costo ?? 0)}`,
                  `Margen ${p.margen === null ? '—' : formatearPorcentaje(p.margen)}`,
                ],
              })),
            )}
            formatear={formatearBs}
            etiqueta="Barras: ganancia por producto; las pérdidas van a la izquierda del cero"
          />
        </TarjetaGrafico>
      )}

      {reporte.porMetodoPago.length > 1 ? (
        <TarjetaGrafico
          titulo="¿Cómo pagan los clientes?"
          descripcion="Cómo se reparte el total entre los métodos de pago"
          tabla={<TablaDatos {...metodos} />}
        >
          <BarraRepartida
            partes={reporte.porMetodoPago.map((m) => ({
              nombre: m.metodo,
              valor: m.total,
              color: colorMetodoPago(m.metodo),
              detalle: plural(m.cantidadVentas, 'venta', 'ventas'),
            }))}
            formatear={formatearBs}
            etiqueta="Barra repartida: total vendido por método de pago"
          />
        </TarjetaGrafico>
      ) : (
        <TablaReporte titulo="Por método de pago" {...metodos} />
      )}

      {vendedores.filas.length > 1 ? (
        <TarjetaGrafico
          titulo="¿Quién vendió más?"
          descripcion="Total cobrado por cada vendedor, en bolivianos"
          tabla={<TablaDatos {...vendedores} />}
        >
          <BarrasRanking
            barras={ranking(
              vendedores.filas.map((v) => ({
                nombre: v.vendedor,
                valor: v.total,
                detalle: [plural(v.cantidadVentas, 'venta', 'ventas')],
              })),
            )}
            formatear={formatearBs}
            etiqueta="Barras: total vendido por vendedor, de mayor a menor"
          />
        </TarjetaGrafico>
      ) : (
        vendedores.filas.length === 1 && <TablaReporte titulo="Por vendedor" {...vendedores} />
      )}
    </Tablero>
  );
}
