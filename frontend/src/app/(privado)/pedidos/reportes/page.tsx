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
  BarrasRanking,
  COLOR_OTROS,
  COLOR_SERIE,
  ColumnasEnElTiempo,
  ListaAvance,
  Tablero,
  TarjetaGrafico,
} from '@/components/reportes/Graficos';
import { Embudo, HistogramaPoligono, Ojiva } from '@/components/reportes/GraficosEstadisticos';
import {
  agruparEnElTiempo,
  diaDe,
  esPorMes,
  extremos,
  histograma,
  percentil,
  plural,
  ranking,
} from '@/lib/series';
import type {
  LineaProductoReporte,
  ProductoCatalogo,
  ReportePedidos,
  Repartidor,
} from '@/types';
import { formatearBs, formatearCantidad, formatearPorcentaje } from '@/lib/formato';
import { ETIQUETA_ESTADO } from '@/lib/pedidos';

/**
 * RF-PED-10 — reporte de pedidos por fecha, estado y repartidor, con el tiempo
 * de entrega.
 *
 * Responde las dos preguntas del reparto: cuántos pedidos entraron y cuánto se
 * tarda en llevarlos. El tiempo no está guardado en ninguna columna; sale de
 * restar la confirmación a la entrega, y por eso solo lo tienen los pedidos que
 * de verdad llegaron.
 *
 * También dice cuánto se ganó: el mismo cálculo que el reporte de ventas, sobre
 * los pedidos no cancelados. Filtrado por un producto, el dinero es el de ese
 * producto, no el del pedido entero.
 */
export default function PaginaReportePedidos() {
  return (
    <RequierePermiso permiso="PEDIDO_LEER">
      <ReportePedidosPantalla />
    </RequierePermiso>
  );
}

/** Los minutos, o el aviso de que todavía no hay con qué medirlos. */
const minutos = (valor: number | null) => (valor === null ? 'sin datos' : `${valor} min`);

function ReportePedidosPantalla() {
  const [estado, setEstado] = useState<string | null>(null);
  const [idRepartidor, setIdRepartidor] = useState<number | null>(null);
  const [repartidores, setRepartidores] = useState<Repartidor[]>([]);
  const [idProducto, setIdProducto] = useState<number | null>(null);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);

  useEffect(() => {
    // Sin una lista, su filtro queda vacío; el reporte general sigue vivo.
    api
      .get<Repartidor[]>('/gestion/repartidores')
      .then(setRepartidores)
      .catch(() => {});
    api
      .get<ProductoCatalogo[]>('/catalogo')
      .then(setProductos)
      .catch(() => {});
  }, []);

  return (
    <MarcoReporte<ReportePedidos>
      titulo="Reporte de pedidos"
      descripcion="Cuántos pedidos entraron, cuánto se ganó con ellos y cuánto se tardó en entregarlos"
      recurso="pedidos"
      filtros={{
        estado: estado ?? undefined,
        idRepartidor: idRepartidor ?? undefined,
        idProducto: idProducto ?? undefined,
      }}
      controles={
        // Tres filtros no caben en la columna de uno: van en su propia fila.
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3 lg:col-span-3">
          <Selector<number>
            etiqueta="Producto"
            valor={idProducto}
            marcador="Todos"
            onCambiar={(v) => setIdProducto(v === -1 ? null : v)}
            opciones={[
              { valor: -1, etiqueta: 'Todos los productos' },
              ...productos.map((p) => ({ valor: p.id, etiqueta: p.nombre })),
            ]}
          />
          <Selector<string>
            etiqueta="Estado"
            valor={estado}
            marcador="Todos"
            onCambiar={(v) => setEstado(v === '' ? null : v)}
            opciones={[
              { valor: '', etiqueta: 'Todos los estados' },
              // Los mismos nombres y etiquetas que usa el resto del módulo.
              ...Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => ({
                valor,
                etiqueta,
              })),
            ]}
          />
          <Selector<number>
            etiqueta="Repartidor"
            valor={idRepartidor}
            marcador="Todos"
            onCambiar={(v) => setIdRepartidor(v === -1 ? null : v)}
            opciones={[
              { valor: -1, etiqueta: 'Todos los repartidores' },
              ...repartidores.map((r) => ({ valor: r.id, etiqueta: r.nombreCompleto })),
            ]}
          />
        </div>
      }
      vacio={(r) => r.resumen.cantidadPedidos === 0}
      tituloVacio="Sin pedidos en el período"
    >
      {(reporte) => (
        <>
          <Cifras>
            <Cifra etiqueta="Pedidos" valor={String(reporte.resumen.cantidadPedidos)} />
            <Cifra etiqueta="Entregados" valor={String(reporte.resumen.entregados)} />
            {/* Sin los cancelados: un pedido cancelado no dejó dinero. */}
            <Cifra
              etiqueta="Total sin cancelados"
              valor={formatearBs(reporte.resumen.total)}
              destacada
            />
            <Cifra
              etiqueta="Entrega promedio"
              valor={minutos(reporte.resumen.minutosPromedio)}
            />
          </Cifras>

          {/* Como el total: sin los cancelados, cuyo stock volvió al almacén. */}
          <CifrasGanancia ganancia={reporte.resumen} />

          <TableroPedidos reporte={reporte} />

          <TablaReporte
            titulo="Detalle de pedidos"
            filas={reporte.pedidos}
            clave={(p) => p.id}
            columnas={[
              { titulo: 'Pedido', celda: (p) => `#${String(p.id).padStart(5, '0')}` },
              {
                titulo: 'Fecha',
                celda: (p) => new Date(p.fecha).toLocaleDateString('es-BO'),
              },
              { titulo: 'Estado', celda: (p) => p.estado },
              { titulo: 'Repartidor', celda: (p) => p.repartidor ?? '—' },
              {
                // Filtrado por producto, es lo de ese producto en el pedido.
                titulo: reporte.producto ? 'Importe del producto' : 'Total',
                numerica: true,
                celda: (p) => formatearBs(p.total),
              },
              {
                titulo: 'Entrega',
                numerica: true,
                celda: (p) => minutos(p.minutosDeEntrega),
              },
            ]}
          />
        </>
      )}
    </MarcoReporte>
  );
}

type FilaEstado = ReportePedidos['porEstado'][number];
type FilaRepartidor = ReportePedidos['porRepartidor'][number];

/** El orden del recorrido de un pedido: así se lee dónde se acumulan. */
const ORDEN_ESTADO = Object.keys(ETIQUETA_ESTADO);
const etiquetaEstado = (estado: string) =>
  ETIQUETA_ESTADO[estado as keyof typeof ETIQUETA_ESTADO] ?? estado;


/**
 * Las etapas del embudo: hasta dónde llegó cada pedido. Un pedido en camino ya
 * pasó por «recibido» y «en preparación», así que cuenta en las tres. Los
 * cancelados no tienen etapa (se pudieron cancelar en cualquiera) y van aparte.
 */
const ETAPAS: { nombre: string; desde: number }[] = [
  { nombre: 'Entraron', desde: 0 },
  { nombre: 'Recibidos (pagados)', desde: 1 },
  { nombre: 'En preparación', desde: 2 },
  { nombre: 'En camino', desde: 3 },
  { nombre: 'Entregados', desde: 4 },
];
const RANGO_ESTADO: Record<string, number> = {
  'Pendiente de pago': 0,
  Recibido: 1,
  'En preparacion': 2,
  'En camino': 3,
  Entregado: 4,
};

/**
 * Los gráficos del reporte, cada uno con su tabla a un botón y el nombre del
 * gráfico junto al título. Un gráfico de un solo dato no dice más que la cifra:
 * en ese caso va la tabla.
 */
function TableroPedidos({ reporte }: { reporte: ReportePedidos }) {
  const dias = agruparEnElTiempo(
    reporte.desde,
    reporte.hasta,
    reporte.pedidos.map((p) => {
      const cancelado = p.estado === 'Cancelado';
      const entregado = p.estado === 'Entregado';
      return {
        dia: diaDe(p.fecha),
        valores: {
          entregados: entregado ? 1 : 0,
          enCurso: !entregado && !cancelado ? 1 : 0,
          cancelados: cancelado ? 1 : 0,
          total: cancelado ? 0 : p.total,
        },
      };
    }),
    { entregados: 0, enCurso: 0, cancelados: 0, total: 0 },
  );
  const periodo = esPorMes(dias) ? 'mes' : 'día';

  // Embudo: cuántos llegaron a cada etapa.
  const etapas = ETAPAS.map((e) => ({
    nombre: e.nombre,
    valor: reporte.porEstado
      .filter((x) => (RANGO_ESTADO[x.estado] ?? -1) >= e.desde)
      .reduce((s, x) => s + x.cantidad, 0),
  }));
  const entraron = etapas[0].valor;
  const cancelados = reporte.porEstado.find((x) => x.estado === 'Cancelado')?.cantidad ?? 0;

  // Histograma y ojiva de los minutos de entrega (solo los que llegaron).
  const minutosEntrega = reporte.pedidos
    .map((p) => p.minutosDeEntrega)
    .filter((m): m is number => m !== null);
  const { clases, ancho, k } = histograma(minutosEntrega, 5);
  const mediana = percentil(clases, 50);
  const p90 = percentil(clases, 90);
  const conTiempos = minutosEntrega.length >= 3 && clases.length > 1;
  const tablaFrecuencias = (
    <TablaDatos
      filas={clases}
      clave={(c) => c.etiqueta}
      columnas={[
        { titulo: 'Minutos', celda: (c) => `${c.desde} a ${c.hasta}` },
        { titulo: 'Marca de clase', numerica: true, celda: (c) => formatearCantidad(c.marca) },
        { titulo: 'Frecuencia', numerica: true, celda: (c) => c.frecuencia },
        { titulo: 'Frec. relativa', numerica: true, celda: (c) => formatearPorcentaje(c.relativa) },
        { titulo: 'Frec. acumulada', numerica: true, celda: (c) => c.acumulada },
        { titulo: '% acumulado', numerica: true, celda: (c) => formatearPorcentaje(c.porcentajeAcumulado) },
      ]}
    />
  );

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

  const estados = {
    filas: [...reporte.porEstado].sort(
      (a, b) => ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado),
    ),
    clave: (e: FilaEstado) => e.estado,
    columnas: [
      { titulo: 'Estado', celda: (e) => etiquetaEstado(e.estado) },
      { titulo: 'Pedidos', numerica: true, celda: (e) => e.cantidad },
      { titulo: 'Total', numerica: true, celda: (e) => formatearBs(e.total) },
    ] as ColumnaTabla<FilaEstado>[],
  };

  const repartidores = {
    filas: reporte.porRepartidor,
    clave: (r: FilaRepartidor) => r.repartidor,
    columnas: [
      { titulo: 'Repartidor', celda: (r) => r.repartidor },
      { titulo: 'Asignados', numerica: true, celda: (r) => r.asignados },
      { titulo: 'Entregados', numerica: true, celda: (r) => r.entregas },
      {
        titulo: 'Tiempo promedio',
        numerica: true,
        celda: (r) => minutos(r.minutosPromedio),
      },
    ] as ColumnaTabla<FilaRepartidor>[],
  };

  return (
    <Tablero>
      <TarjetaGrafico
        ancho
        tipo="Columnas apiladas"
        titulo={`¿Cuántos pedidos entraron cada ${periodo}?`}
        descripcion={`Pedidos por ${periodo}, partidos según cómo terminaron. El monto del recuadro no suma los cancelados`}
        tabla={
          <TablaDatos
            filas={dias.filter((d) => d.entregados + d.enCurso + d.cancelados > 0)}
            clave={(d) => d.clave}
            columnas={[
              { titulo: periodo === 'mes' ? 'Mes' : 'Día', celda: (d) => d.etiquetaLarga },
              { titulo: 'Entregados', numerica: true, celda: (d) => d.entregados },
              { titulo: 'En curso', numerica: true, celda: (d) => d.enCurso },
              { titulo: 'Cancelados', numerica: true, celda: (d) => d.cancelados },
              { titulo: 'Total sin cancelados', numerica: true, celda: (d) => formatearBs(d.total) },
            ]}
          />
        }
      >
        <ColumnasEnElTiempo
          datos={dias}
          series={[
            { clave: 'entregados', nombre: 'Entregados', color: COLOR_SERIE[0] },
            { clave: 'enCurso', nombre: 'En curso', color: COLOR_SERIE[1] },
            { clave: 'cancelados', nombre: 'Cancelados', color: COLOR_OTROS },
          ]}
          formatear={(n) => String(n)}
          enteros
          notas={(d) => [`${formatearBs(d.total)} sin cancelados`]}
          etiqueta={`Columnas apiladas: pedidos por ${periodo} según cómo terminaron`}
        />
      </TarjetaGrafico>

      {entraron > 0 ? (
        <TarjetaGrafico
          tipo="Embudo"
          titulo="¿Hasta dónde llegan los pedidos?"
          descripcion={`Cuántos llegaron a cada etapa del recorrido${
            cancelados ? `, sin los ${plural(cancelados, 'cancelado', 'cancelados')}` : ''
          }. Lo que se angosta es lo que todavía no avanza`}
          tabla={
            <>
              <TablaDatos
                filas={etapas}
                clave={(e) => e.nombre}
                columnas={[
                  { titulo: 'Etapa', celda: (e) => e.nombre },
                  { titulo: 'Llegaron', numerica: true, celda: (e) => e.valor },
                  {
                    titulo: '% de los que entraron',
                    numerica: true,
                    celda: (e) => formatearPorcentaje(entraron ? (e.valor / entraron) * 100 : 0),
                  },
                ]}
              />
              <TablaDatos {...estados} />
            </>
          }
        >
          <Embudo etapas={etapas} nombre="pedidos" etiqueta="Embudo: pedidos que llegaron a cada etapa" />
        </TarjetaGrafico>
      ) : (
        <TablaReporte titulo="Por estado" {...estados} />
      )}

      {reporte.porRepartidor.length > 0 ? (
        <TarjetaGrafico
          tipo="Medidores"
          titulo="¿Cómo rinden los repartidores?"
          descripcion="Cuántos de sus pedidos asignados entregó cada uno, y en cuánto tiempo"
          tabla={<TablaDatos {...repartidores} />}
        >
          <ListaAvance
            filas={reporte.porRepartidor.map((r) => ({
              nombre: r.repartidor,
              hecho: r.entregas,
              total: r.asignados,
              cifra: `${r.entregas} de ${r.asignados} entregados${
                r.minutosPromedio === null ? '' : ` · ${r.minutosPromedio} min en promedio`
              }`,
            }))}
            etiqueta="Pedidos entregados de los asignados, por repartidor"
          />
        </TarjetaGrafico>
      ) : (
        <TablaReporte titulo="Por repartidor" {...repartidores} />
      )}

      {/* Junto a los repartidores cuando el embudo no está, para no dejar un hueco. */}
      {conTiempos && (
        <TarjetaGrafico
          tipo="Histograma y polígono de frecuencias"
          titulo="¿Cuánto tardan las entregas?"
          descripcion={`${plural(minutosEntrega.length, 'pedido entregado', 'pedidos entregados')} según los minutos que tardó, en ${k} clases de ${ancho} min (regla de Sturges)`}
          tabla={tablaFrecuencias}
        >
          <HistogramaPoligono clases={clases} unidad="min" nombre="pedidos" etiqueta="Histograma de los minutos de entrega" />
        </TarjetaGrafico>
      )}

      {conTiempos && (
        <TarjetaGrafico
          tipo="Ojiva"
          titulo="¿Qué parte llega a tiempo?"
          descripcion={
            mediana === null
              ? 'Porcentaje acumulado de pedidos entregados hasta cada tiempo'
              : `La mitad de los pedidos se entrega en ${formatearCantidad(mediana)} min o menos (mediana)${
                  p90 === null ? '' : `, y el 90 % en ${formatearCantidad(p90)} min o menos`
                }`
          }
          tabla={tablaFrecuencias}
        >
          <Ojiva
            puntos={[
              { etiqueta: String(clases[0].desde), valor: 0, titulo: `Menos de ${clases[0].desde} min` },
              ...clases.map((c) => ({
                etiqueta: String(c.hasta),
                valor: c.porcentajeAcumulado,
                titulo: `Hasta ${c.hasta} min`,
                notas: [`${c.acumulada} de ${minutosEntrega.length} pedidos`],
              })),
            ]}
            formatear={formatearPorcentaje}
            formatearEje={(v) => `${v} %`}
            nombre="de los pedidos"
            maximoEje={100}
            referencia={
              mediana === null ? undefined : { valor: 50, etiqueta: `Mediana ≈ ${formatearCantidad(mediana)} min` }
            }
            etiqueta="Ojiva: porcentaje acumulado de pedidos por minutos de entrega"
          />
        </TarjetaGrafico>
      )}

      {reporte.porProducto.length > 1 ? (
        <TarjetaGrafico
          tipo="Barras horizontales"
          titulo="¿Qué productos se piden más?"
          descripcion="Lo vendido de cada producto en los pedidos no cancelados, en bolivianos"
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
            etiqueta="Barras: importe por producto, de mayor a menor"
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
          tipo="Barras divergentes"
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
    </Tablero>
  );
}
