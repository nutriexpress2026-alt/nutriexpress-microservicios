'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RequierePermiso } from '@/components/RequierePermiso';
import { Selector } from '@/components/ui/Selector';
import { Insignia } from '@/components/ui/Insignia';
import { MarcoReporte } from '@/components/reportes/MarcoReporte';
import {
  Cifra,
  Cifras,
  TablaDatos,
  TablaReporte,
  type ColumnaTabla,
} from '@/components/reportes/PiezasReporte';
import {
  COLOR_SERIE,
  ColumnasEnElTiempo,
  Tablero,
  TarjetaGrafico,
} from '@/components/reportes/Graficos';
import { MapaArbol, Torta, partesConColor } from '@/components/reportes/GraficosEstadisticos';
import type { ProductoCatalogo, ReporteProduccion } from '@/types';
import { formatearBs, formatearCantidad } from '@/lib/formato';
import { agruparEnElTiempo, diaDe, esPorMes, plural } from '@/lib/series';

/**
 * RF-PRO-08 — reporte de producción por fecha y producto, con el costo de cada
 * corrida y los insumos consumidos.
 *
 * El costo lo trae **registrado la propia orden** (hallazgo H5): se congela al
 * finalizar, con los precios de ese día. Recalcularlo desde la receta haría que
 * corregir el precio de un insumo reescribiera el costo de todo lo ya
 * producido.
 *
 * Las unidades son las **obtenidas**, no las planificadas, y la merma tiene su
 * propia cifra: si se perdieron tres barras, el reporte no puede declarar que
 * salieron (hallazgo H10).
 */
export default function PaginaReporteProduccion() {
  return (
    <RequierePermiso permiso="ORDEN_PRODUCCION_GESTIONAR">
      <ReporteProduccionPantalla />
    </RequierePermiso>
  );
}

function ReporteProduccionPantalla() {
  const [idProducto, setIdProducto] = useState<number | null>(null);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);

  useEffect(() => {
    api
      .get<ProductoCatalogo[]>('/catalogo')
      .then(setProductos)
      .catch(() => {
        // Sin la lista el filtro queda vacío; el reporte general sigue vivo.
      });
  }, []);

  return (
    <MarcoReporte<ReporteProduccion>
      titulo="Reporte de producción"
      descripcion="Cuánto se produjo, qué costó y qué insumos se consumieron"
      recurso="produccion"
      filtros={{ idProducto: idProducto ?? undefined }}
      controles={
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
      }
      vacio={(r) => r.resumen.corridas === 0}
      tituloVacio="Sin producción en el período"
    >
      {(reporte) => (
        <>
          <Cifras>
            <Cifra etiqueta="Corridas" valor={String(reporte.resumen.corridas)} />
            <Cifra etiqueta="Unidades" valor={String(reporte.resumen.unidades)} />
            <Cifra
              etiqueta="Costo total"
              valor={formatearBs(reporte.resumen.costoTotal)}
              destacada
            />
            {/* La merma es la pregunta que responde H10: cuánto se perdió. */}
            <Cifra etiqueta="Merma" valor={String(reporte.resumen.merma)} />
            <Cifra
              etiqueta="Costo unitario"
              valor={formatearBs(reporte.resumen.costoUnitarioPromedio)}
            />
          </Cifras>

          <TableroProduccion reporte={reporte} />

          <TablaReporte
            titulo="Corridas"
            filas={reporte.corridas}
            clave={(c) => c.idOrden}
            columnas={[
              { titulo: 'Orden', celda: (c) => `#${String(c.idOrden).padStart(5, '0')}` },
              {
                titulo: 'Fecha',
                celda: (c) => new Date(c.fecha).toLocaleDateString('es-BO'),
              },
              {
                titulo: 'Producto',
                celda: (c) => (
                  <span className="flex items-center gap-2">
                    {c.producto}
                    {/* Distinguirlas importa: una corrida instantánea nació de
                        una venta de mostrador, no de una planificación. */}
                    {c.instantanea && <Insignia tono="info">Al instante</Insignia>}
                  </span>
                ),
              },
              { titulo: 'Obtenidas', numerica: true, celda: (c) => c.cantidad },
              {
                titulo: 'Merma',
                numerica: true,
                // Un guion en vez de un cero: lo normal es no tener merma, y
                // una columna de ceros esconde las corridas que sí la tuvieron.
                celda: (c) => (c.merma > 0 ? c.merma : '—'),
              },
              { titulo: 'Costo', numerica: true, celda: (c) => formatearBs(c.costo) },
              {
                titulo: 'Costo unitario',
                numerica: true,
                celda: (c) => formatearBs(c.costoUnitario),
              },
            ]}
          />
        </>
      )}
    </MarcoReporte>
  );
}

type FilaProducto = ReporteProduccion['porProducto'][number];
type FilaInsumo = ReporteProduccion['insumosConsumidos'][number];

/**
 * Los gráficos del reporte, cada uno con su tabla a un botón. Un gráfico de una
 * sola barra no dice más que la cifra: en ese caso va la tabla.
 */
function TableroProduccion({ reporte }: { reporte: ReporteProduccion }) {
  const dias = agruparEnElTiempo(
    reporte.desde,
    reporte.hasta,
    reporte.corridas.map((c) => ({
      dia: diaDe(c.fecha),
      valores: { unidades: c.cantidad, merma: c.merma, corridas: 1, costo: c.costo },
    })),
    { unidades: 0, merma: 0, corridas: 0, costo: 0 },
  );
  const periodo = esPorMes(dias) ? 'mes' : 'día';

  const productos = {
    filas: reporte.porProducto,
    clave: (p: FilaProducto) => p.producto,
    columnas: [
      { titulo: 'Producto', celda: (p) => p.producto },
      { titulo: 'Corridas', numerica: true, celda: (p) => p.corridas },
      { titulo: 'Unidades', numerica: true, celda: (p) => p.unidades },
      { titulo: 'Costo', numerica: true, celda: (p) => formatearBs(p.costo) },
    ] as ColumnaTabla<FilaProducto>[],
  };

  const insumos = {
    filas: reporte.insumosConsumidos,
    clave: (i: FilaInsumo) => i.insumo,
    columnas: [
      { titulo: 'Insumo', celda: (i) => i.insumo },
      {
        titulo: 'Cantidad',
        numerica: true,
        celda: (i) => `${formatearCantidad(i.cantidad)} ${i.unidad}`,
      },
      { titulo: 'Costo', numerica: true, celda: (i) => formatearBs(i.costo) },
    ] as ColumnaTabla<FilaInsumo>[],
  };

  return (
    <Tablero>
      <TarjetaGrafico
        ancho
        tipo="Columnas apiladas"
        titulo={`¿Cuánto se produjo y cuánto se perdió cada ${periodo}?`}
        descripcion={`Unidades obtenidas y, encima, la merma de cada ${periodo}: el alto total es lo que se planificó. El costo está en el recuadro`}
        tabla={
          <TablaDatos
            filas={dias.filter((d) => d.corridas > 0)}
            clave={(d) => d.clave}
            columnas={[
              { titulo: periodo === 'mes' ? 'Mes' : 'Día', celda: (d) => d.etiquetaLarga },
              { titulo: 'Corridas', numerica: true, celda: (d) => d.corridas },
              { titulo: 'Unidades', numerica: true, celda: (d) => d.unidades },
              { titulo: 'Merma', numerica: true, celda: (d) => (d.merma > 0 ? d.merma : '—') },
              { titulo: 'Costo', numerica: true, celda: (d) => formatearBs(d.costo) },
            ]}
          />
        }
      >
        <ColumnasEnElTiempo
          datos={dias}
          series={[
            { clave: 'unidades', nombre: 'Obtenidas', color: COLOR_SERIE[0] },
            { clave: 'merma', nombre: 'Merma', color: COLOR_SERIE[1] },
          ]}
          formatear={(n) => formatearCantidad(n)}
          enteros
          notas={(d) => [plural(d.corridas, 'corrida', 'corridas'), `Costo ${formatearBs(d.costo)}`]}
          etiqueta={`Columnas apiladas: unidades obtenidas y merma por ${periodo}`}
        />
      </TarjetaGrafico>

      {productos.filas.length > 1 ? (
        <TarjetaGrafico
          tipo="Gráfico de torta"
          titulo="¿Qué se produjo más?"
          descripcion="La parte de cada producto en las unidades obtenidas"
          tabla={<TablaDatos {...productos} />}
        >
          <Torta
            partes={partesConColor(
              reporte.porProducto.map((p) => ({
                nombre: p.producto,
                valor: p.unidades,
                detalle: plural(p.corridas, 'corrida', 'corridas'),
              })),
            )}
            formatear={(n) => `${formatearCantidad(n)} u`}
            centro={{ valor: formatearCantidad(reporte.resumen.unidades), texto: 'unidades' }}
            etiqueta="Torta: unidades producidas por producto"
          />
        </TarjetaGrafico>
      ) : (
        <TablaReporte titulo="Por producto" {...productos} />
      )}

      {/* En bolivianos y no en cantidad: kilos y litros no se comparan entre sí. */}
      {insumos.filas.length > 1 ? (
        <TarjetaGrafico
          tipo="Mapa de árbol"
          titulo="¿En qué insumos se gastó más?"
          descripcion="Cada rectángulo es un insumo, tan grande como lo que costó lo consumido"
          tabla={<TablaDatos {...insumos} />}
        >
          <MapaArbol
            partes={partesConColor(
              reporte.insumosConsumidos.map((i) => ({
                nombre: i.insumo,
                valor: i.costo,
                detalle: `${formatearCantidad(i.cantidad)} ${i.unidad} consumidos`,
              })),
            )}
            formatear={formatearBs}
            etiqueta="Mapa de árbol: costo de los insumos consumidos"
          />
        </TarjetaGrafico>
      ) : (
        <TablaReporte titulo="Insumos consumidos" {...insumos} />
      )}
    </Tablero>
  );
}
