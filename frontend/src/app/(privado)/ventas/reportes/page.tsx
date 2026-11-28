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
import { BarrasRanking, Tablero, TarjetaGrafico, colorMetodoPago } from '@/components/reportes/Graficos';
import {
  AreaEnElTiempo,
  Burbujas,
  Ojiva,
  Pareto,
  RadarSemana,
  Torta,
} from '@/components/reportes/GraficosEstadisticos';
import type { LineaProductoReporte, ProductoCatalogo, ReporteVentas } from '@/types';
import { formatearBs, formatearCantidad, formatearPorcentaje } from '@/lib/formato';
import {
  acumular,
  agruparEnElTiempo,
  esPorMes,
  pareto,
  plural,
  porDiaDeLaSemana,
  ranking,
} from '@/lib/series';

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
 * Los gráficos del reporte, cada uno con su tabla al lado (botón «Tabla») y el
 * nombre del gráfico junto al título.
 *
 * Un gráfico con un solo dato no dice más que la cifra: cuando el filtro deja un
 * solo producto, un solo método o un solo vendedor, va la tabla directamente.
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

  // Ojiva: lo vendido acumulado, y cuándo se llegó a la mitad del total.
  const acumulado = acumular(dias, (d) => d.total);
  const totalVendido = acumulado[acumulado.length - 1]?.acumulado ?? 0;
  const mitad = acumulado.find((d) => d.porcentaje >= 50);

  // Radar: solo si el rango tiene cada día de la semana al menos una vez y hubo
  // ventas en tres días distintos o más (con uno solo, la figura es una raya).
  const semana = porDiaDeLaSemana(
    reporte.desde,
    reporte.hasta,
    reporte.porDia.map((d) => ({ dia: d.dia, total: d.total, cantidad: d.cantidadVentas })),
  );
  const conSemana =
    semana.length === 7 &&
    semana.every((d) => d.veces > 0) &&
    semana.filter((d) => d.promedio > 0).length >= 3;
  const mejorDia = [...semana].sort((a, b) => b.promedio - a.promedio)[0];

  const barrasPareto = pareto(
    reporte.porProducto.map((p) => ({
      nombre: p.nombre,
      valor: p.importe,
      detalle: [plural(p.unidades, 'unidad', 'unidades')],
    })),
  );
  const cuantosA = barrasPareto.filter((b) => b.clase === 'A' && !b.otros).length;
  const conCosto = reporte.porProducto.filter((p) => p.ganancia !== null && p.margen !== null);

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
  const totalMetodos = reporte.porMetodoPago.reduce((s, m) => s + m.total, 0);

  return (
    <Tablero>
      <TarjetaGrafico
        ancho
        tipo="Gráfico de área"
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
        <AreaEnElTiempo
          puntos={dias.map((d) => ({
            etiqueta: d.etiqueta,
            etiquetaLarga: d.etiquetaLarga,
            valor: d.total,
            notas: [plural(d.cantidadVentas, 'venta', 'ventas')],
          }))}
          formatear={formatearBs}
          nombre="vendido"
          etiqueta={`Área: total vendido por ${periodo}`}
        />
      </TarjetaGrafico>

      <TarjetaGrafico
        ancho={!conSemana}
        tipo="Ojiva"
        titulo="¿A qué ritmo se llegó al total?"
        descripcion={
          mitad
            ? `Lo vendido acumulado. La mitad del total se alcanzó ${periodo === 'mes' ? 'en' : 'el'} ${mitad.etiquetaLarga}`
            : 'Lo vendido acumulado en el período'
        }
        tabla={
          <TablaDatos
            filas={acumulado.filter((d) => d.cantidadVentas > 0)}
            clave={(d) => d.clave}
            columnas={[
              { titulo: periodo === 'mes' ? 'Mes' : 'Día', celda: (d) => d.etiquetaLarga },
              { titulo: 'Vendido', numerica: true, celda: (d) => formatearBs(d.total) },
              { titulo: 'Acumulado', numerica: true, celda: (d) => formatearBs(d.acumulado) },
              { titulo: '% acumulado', numerica: true, celda: (d) => formatearPorcentaje(d.porcentaje) },
            ]}
          />
        }
      >
        <Ojiva
          puntos={acumulado.map((d) => ({
            etiqueta: d.etiqueta,
            valor: d.acumulado,
            titulo: `Hasta ${periodo === 'mes' ? '' : 'el '}${d.etiquetaLarga}`,
            notas: [
              `${formatearPorcentaje(d.porcentaje)} del total`,
              `Ese ${periodo}: ${formatearBs(d.total)}`,
            ],
          }))}
          formatear={formatearBs}
          nombre="acumulado"
          referencia={totalVendido > 0 ? { valor: totalVendido / 2, etiqueta: 'Mitad del total' } : undefined}
          etiqueta="Ojiva: ventas acumuladas en el período"
        />
      </TarjetaGrafico>

      {conSemana && (
        <TarjetaGrafico
          tipo="Gráfico de radar"
          titulo="¿Qué días de la semana se vende más?"
          descripcion={`Promedio cobrado por cada día de la semana. El ${mejorDia.dia.toLowerCase()} es el más fuerte`}
          tabla={
            <TablaDatos
              filas={semana}
              clave={(d) => d.dia}
              columnas={[
                { titulo: 'Día', celda: (d) => d.dia },
                { titulo: 'Veces en el rango', numerica: true, celda: (d) => d.veces },
                { titulo: 'Ventas por día', numerica: true, celda: (d) => d.cantidadPromedio },
                { titulo: 'Promedio', numerica: true, celda: (d) => formatearBs(d.promedio) },
              ]}
            />
          }
        >
          <RadarSemana
            puntos={semana.map((d) => ({
              corto: d.corto,
              dia: d.dia,
              valor: d.promedio,
              notas: [`${d.cantidadPromedio} ventas en promedio`, `Promedio de ${plural(d.veces, 'día', 'días')}`],
            }))}
            formatear={formatearBs}
            nombre="en promedio"
            etiqueta="Radar: promedio vendido por día de la semana"
          />
        </TarjetaGrafico>
      )}

      {barrasPareto.length > 1 ? (
        <TarjetaGrafico
          ancho
          tipo="Diagrama de Pareto"
          titulo="¿Qué productos hacen la mayor parte de las ventas?"
          descripcion={`Cada producto con su parte de lo cobrado y el acumulado. ${
            cuantosA === 1 ? 'Un producto (clase A) hace' : `${cuantosA} productos (clase A) hacen`
          } el 80 % de lo vendido`}
          tabla={
            <TablaDatos
              filas={barrasPareto}
              clave={(b) => b.nombre}
              columnas={[
                { titulo: 'Producto', celda: (b) => b.nombre },
                { titulo: 'Importe', numerica: true, celda: (b) => formatearBs(b.valor) },
                { titulo: '% del total', numerica: true, celda: (b) => formatearPorcentaje(b.porcentaje) },
                { titulo: '% acumulado', numerica: true, celda: (b) => formatearPorcentaje(b.acumulado) },
                { titulo: 'Clase', celda: (b) => b.clase },
              ]}
            />
          }
        >
          <Pareto barras={barrasPareto} formatear={formatearBs} etiqueta="Diagrama de Pareto: productos por importe" />
        </TarjetaGrafico>
      ) : (
        // Siete columnas no caben en media pantalla: a lo ancho.
        <div className="lg:col-span-2">
          <TablaReporte titulo="Por producto" {...productos} />
        </div>
      )}

      {conCosto.length > 1 && (
        <TarjetaGrafico
          ancho
          tipo="Gráfico de burbujas"
          titulo="¿Qué productos venden mucho y dejan buen margen?"
          descripcion="Cada burbuja es un producto: a la derecha, más unidades; arriba, más margen; más grande, más cobrado. En rojo, los vendidos bajo su costo"
          tabla={<TablaDatos {...productos} />}
        >
          <Burbujas
            puntos={conCosto.map((p) => ({
              nombre: p.nombre,
              x: p.unidades,
              y: p.margen ?? 0,
              z: p.importe,
              notas: [`Cobrado ${formatearBs(p.importe)}`, `Ganancia ${formatearBs(p.ganancia ?? 0)}`],
            }))}
            ejeX="Unidades vendidas"
            ejeY="Margen"
            tamano="lo cobrado"
            formatearX={(v) => formatearCantidad(v)}
            formatearY={(v) => formatearPorcentaje(v)}
            formatearEjeY={(v) => `${Math.round(v)} %`}
            promedioY={reporte.resumen.margen ?? undefined}
            etiqueta="Burbujas: unidades vendidas, margen e importe de cada producto"
          />
        </TarjetaGrafico>
      )}

      {reporte.porMetodoPago.length > 1 ? (
        <TarjetaGrafico
          tipo="Gráfico de torta"
          titulo="¿Cómo pagan los clientes?"
          descripcion="Cómo se reparte lo cobrado entre los métodos de pago"
          tabla={<TablaDatos {...metodos} />}
        >
          <Torta
            partes={reporte.porMetodoPago.map((m) => ({
              nombre: m.metodo,
              valor: m.total,
              color: colorMetodoPago(m.metodo),
              detalle: plural(m.cantidadVentas, 'venta', 'ventas'),
            }))}
            formatear={formatearBs}
            centro={{ valor: formatearBs(totalMetodos), texto: 'cobrado' }}
            etiqueta="Torta: total vendido por método de pago"
          />
        </TarjetaGrafico>
      ) : (
        <TablaReporte titulo="Por método de pago" {...metodos} />
      )}

      {vendedores.filas.length > 1 ? (
        <TarjetaGrafico
          tipo="Barras horizontales"
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
