'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Selector } from '@/components/ui/Selector';
import { Insignia } from '@/components/ui/Insignia';
import { MarcoReporte } from '@/components/reportes/MarcoReporte';
import { Cifra, Cifras, TablaDatos, TablaReporte } from '@/components/reportes/PiezasReporte';
import { COLOR_SERIE, ColumnasEnElTiempo, Tablero, TarjetaGrafico } from '@/components/reportes/Graficos';
import { Pareto, Torta, partesConColor } from '@/components/reportes/GraficosEstadisticos';
import type { ExistenciaStock, ReporteInventario } from '@/types';
import { formatearBs, formatearCantidad, formatearPorcentaje } from '@/lib/formato';
import { agruparEnElTiempo, diaDe, esPorMes, pareto, plural } from '@/lib/series';
import { ETIQUETA_MOTIVO } from '@/lib/inventario';

/** Valor del selector: todos los ítems, o un insumo o producto concreto. */
type Eleccion = 'todos' | `insumo:${number}` | `producto:${number}`;

/**
 * RF-INV-08 — reporte de movimientos de inventario por fecha e ítem.
 *
 * Responde "qué entró, qué salió y cuánto queda" de cada ítem en el período.
 *
 * El filtro ofrece insumos **y** productos terminados: el reporte los mueve a
 * los dos, y antes solo se podía elegir un insumo. La lista sale de
 * `/api/stock` y no de `/api/productos`, porque el reporte vive bajo
 * `STOCK_CONSULTAR` y la gestión de productos exige otro permiso: quien puede
 * ver el reporte tiene que poder usar su filtro.
 *
 * El permiso lo verifica el layout del módulo, igual que las demás pestañas
 * de inventario.
 */
export default function PaginaReporteInventario() {
  const [eleccion, setEleccion] = useState<Eleccion>('todos');
  const [items, setItems] = useState<ExistenciaStock[]>([]);

  useEffect(() => {
    api
      .get<ExistenciaStock[]>('/stock')
      .then(setItems)
      .catch(() => {
        // Sin la lista el filtro queda vacío; el reporte general sigue vivo.
      });
  }, []);

  const filtros = useMemo(() => {
    const [tipo, id] = eleccion.split(':');
    if (tipo === 'insumo') return { idIngrediente: Number(id) };
    if (tipo === 'producto') return { idProducto: Number(id) };
    return {};
  }, [eleccion]);

  const opciones = useMemo(
    () => [
      { valor: 'todos' as Eleccion, etiqueta: 'Todos los ítems' },
      ...items
        .filter((i) => i.tipo === 'insumo')
        .map((i) => ({
          valor: `insumo:${i.id}` as Eleccion,
          etiqueta: i.nombre,
          descripcion: `Insumo · ${i.unidad}`,
        })),
      ...items
        .filter((i) => i.tipo === 'producto')
        .map((i) => ({
          valor: `producto:${i.id}` as Eleccion,
          etiqueta: i.nombre,
          descripcion: 'Producto terminado',
        })),
    ],
    [items],
  );

  return (
    <MarcoReporte<ReporteInventario>
      titulo="Reporte de movimientos"
      descripcion="Qué entró, qué salió y cuánto queda de cada insumo y producto en el período"
      recurso="inventario"
      filtros={filtros}
      controles={
        <Selector<Eleccion>
          etiqueta="Ítem"
          valor={eleccion}
          marcador="Todos los ítems"
          onCambiar={setEleccion}
          opciones={opciones}
        />
      }
      vacio={(r) => r.movimientos.length === 0}
      tituloVacio="Sin movimientos en el período"
    >
      {(reporte) => <CuerpoReporte reporte={reporte} unItem={eleccion !== 'todos'} />}
    </MarcoReporte>
  );
}

function CuerpoReporte({ reporte, unItem }: { reporte: ReporteInventario; unItem: boolean }) {
  /*
   * Con un ítem elegido, las cifras dicen **cuánto** entró y salió, en su
   * unidad. Con todos solo pueden contar movimientos: no se suman kilos con
   * litros ni con unidades. Antes el reporte mostraba "Entradas 3" siempre, y
   * con un insumo elegido se leía como tres kilos cuando eran tres líneas.
   */
  const unico = unItem && reporte.porItem.length === 1 ? reporte.porItem[0] : null;

  return (
    <>
      <Cifras>
        {unico ? (
          <>
            <Cifra etiqueta="Entró" valor={`${formatearCantidad(unico.entradas)} ${unico.unidad}`} />
            <Cifra etiqueta="Salió" valor={`${formatearCantidad(unico.salidas)} ${unico.unidad}`} />
            <Cifra
              etiqueta="Existencia hoy"
              valor={`${formatearCantidad(unico.existencia)} ${unico.unidad}`}
            />
          </>
        ) : (
          <>
            <Cifra etiqueta="Movimientos de entrada" valor={String(reporte.resumen.ingresos)} />
            <Cifra etiqueta="Movimientos de salida" valor={String(reporte.resumen.egresos)} />
          </>
        )}
        <Cifra
          etiqueta="Costo ingresado"
          valor={formatearBs(reporte.resumen.costoIngresado)}
          destacada
        />
      </Cifras>

      <TableroInventario reporte={reporte} unico={unico} />

      <TablaReporte
        titulo="Movimiento por ítem"
        filas={reporte.porItem}
        clave={(i) => `${i.tipo}:${i.item}`}
        columnas={[
          { titulo: 'Ítem', celda: (i) => i.item },
          {
            titulo: 'Tipo',
            celda: (i) => (
              <Insignia tono={i.tipo === 'Insumo' ? 'info' : 'marca'}>{i.tipo}</Insignia>
            ),
          },
          {
            titulo: 'Entradas',
            numerica: true,
            celda: (i) => `${formatearCantidad(i.entradas)} ${i.unidad}`,
          },
          {
            titulo: 'Salidas',
            numerica: true,
            celda: (i) => `${formatearCantidad(i.salidas)} ${i.unidad}`,
          },
          {
            titulo: 'Neto del período',
            numerica: true,
            // En rojo cuando salió más de lo que entró en esas fechas. No es el
            // stock: por eso va al lado la existencia de hoy.
            celda: (i) => (
              <span className={i.neto < 0 ? 'text-peligro' : undefined}>
                {formatearCantidad(i.neto)} {i.unidad}
              </span>
            ),
          },
          {
            titulo: 'Existencia hoy',
            numerica: true,
            celda: (i) => `${formatearCantidad(i.existencia)} ${i.unidad}`,
          },
        ]}
      />

      <TablaReporte
        titulo="Detalle de movimientos"
        filas={reporte.movimientos}
        clave={(m, indice) => `${m.fecha}-${m.tipoItem}-${m.item}-${indice}`}
        columnas={[
          {
            titulo: 'Fecha',
            celda: (m) => new Date(m.fecha).toLocaleDateString('es-BO'),
          },
          {
            titulo: 'Tipo',
            celda: (m) => (
              <Insignia tono={m.tipo === 'Ingreso' ? 'marca' : 'aviso'}>{m.tipo}</Insignia>
            ),
          },
          { titulo: 'Motivo', celda: (m) => ETIQUETA_MOTIVO[m.motivo] ?? m.motivo },
          {
            titulo: 'Ítem',
            celda: (m) => (
              <span>
                {m.item}
                <span className="ml-1.5 text-[11px] text-tinta-tenue">{m.tipoItem}</span>
              </span>
            ),
          },
          {
            titulo: 'Cantidad',
            numerica: true,
            celda: (m) => `${formatearCantidad(m.cantidad)} ${m.unidad}`,
          },
          {
            titulo: 'Costo',
            numerica: true,
            // Un egreso no tiene costo propio: se muestra vacío en vez de un
            // cero que se leería como "salió gratis".
            celda: (m) => (m.costo === null ? '—' : formatearBs(m.costo)),
          },
          {
            titulo: 'Referencia',
            // De dónde vino o para qué salió: el proveedor, o la orden de
            // producción y lo que se elaboró con ese insumo.
            celda: (m) => (
              <span className="text-tinta-suave">{m.referencia ?? '—'}</span>
            ),
          },
        ]}
      />
    </>
  );
}

/**
 * Los gráficos del reporte, cada uno con su tabla a un botón.
 *
 * Con todos los ítems no se pueden sumar kilos con litros, así que el gráfico
 * en el tiempo cuenta **movimientos**; con un ítem elegido muestra **cantidades**
 * en su unidad. Lo que sí se compara entre ítems es el dinero: en qué se invirtió.
 */
function TableroInventario({
  reporte,
  unico,
}: {
  reporte: ReporteInventario;
  unico: ReporteInventario['porItem'][number] | null;
}) {
  const dias = agruparEnElTiempo(
    reporte.desde,
    reporte.hasta,
    reporte.movimientos.map((m) => {
      const cuanto = unico ? m.cantidad : 1;
      const entra = m.tipo === 'Ingreso';
      return {
        dia: diaDe(m.fecha),
        valores: {
          entradas: entra ? cuanto : 0,
          salidas: entra ? 0 : cuanto,
          costo: entra ? (m.costo ?? 0) : 0,
        },
      };
    }),
    { entradas: 0, salidas: 0, costo: 0 },
  );
  const periodo = esPorMes(dias) ? 'mes' : 'día';
  const formatear = unico
    ? (n: number) => `${formatearCantidad(n)} ${unico.unidad}`
    : (n: number) => String(n);

  // Lo que costó lo que entró de cada ítem: en bolivianos sí se comparan todos.
  const inversion = new Map<string, { valor: number; tipo: string }>();
  for (const m of reporte.movimientos) {
    if (m.tipo !== 'Ingreso' || m.costo === null) continue;
    const previo = inversion.get(m.item) ?? { valor: 0, tipo: m.tipoItem };
    previo.valor = Math.round((previo.valor + m.costo) * 100) / 100;
    inversion.set(m.item, previo);
  }
  const invertido = [...inversion].map(([item, d]) => ({ item, ...d }));
  const tipoDe = new Map(invertido.map((f) => [f.item, f.tipo]));
  const abc = pareto(
    invertido.map((f) => ({ nombre: f.item, valor: f.valor, detalle: [f.tipo] })),
    15,
  );
  const cuantosA = abc.filter((b) => b.clase === 'A' && !b.otros).length;

  // Por qué se movió el inventario: cuántos movimientos de cada motivo.
  const porMotivo = new Map<string, number>();
  for (const m of reporte.movimientos) {
    const motivo = ETIQUETA_MOTIVO[m.motivo] ?? m.motivo;
    porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1);
  }
  const motivos = partesConColor(
    [...porMotivo].map(([nombre, valor]) => ({ nombre, valor })),
    6,
  );

  return (
    <Tablero>
      <TarjetaGrafico
        ancho
        tipo="Columnas divergentes"
        titulo={`¿Qué entró y qué salió cada ${periodo}?`}
        descripcion={
          unico
            ? `Cantidades de ${unico.item}, en ${unico.unidad}: las entradas suben y las salidas bajan`
            : `Movimientos por ${periodo}: las entradas suben y las salidas bajan. Elija un ítem para ver cantidades`
        }
        tabla={
          <TablaDatos
            filas={dias.filter((d) => d.entradas > 0 || d.salidas > 0)}
            clave={(d) => d.clave}
            columnas={[
              { titulo: periodo === 'mes' ? 'Mes' : 'Día', celda: (d) => d.etiquetaLarga },
              { titulo: 'Entradas', numerica: true, celda: (d) => formatear(d.entradas) },
              { titulo: 'Salidas', numerica: true, celda: (d) => formatear(d.salidas) },
              { titulo: 'Costo ingresado', numerica: true, celda: (d) => formatearBs(d.costo) },
            ]}
          />
        }
      >
        <ColumnasEnElTiempo
          datos={dias}
          series={[
            { clave: 'entradas', nombre: 'Entradas', color: COLOR_SERIE[0] },
            { clave: 'salidas', nombre: 'Salidas', color: COLOR_SERIE[1], haciaAbajo: true },
          ]}
          formatear={formatear}
          enteros={!unico}
          notas={(d) => (d.costo > 0 ? [`Costo ingresado ${formatearBs(d.costo)}`] : [])}
          etiqueta={`Columnas: entradas y salidas por ${periodo}`}
        />
      </TarjetaGrafico>

      {abc.length > 1 && (
        <TarjetaGrafico
          ancho
          tipo="Análisis ABC (Pareto)"
          titulo="¿En qué se invirtió más?"
          descripcion={`Lo que costó lo que entró de cada ítem. ${
            cuantosA === 1 ? 'Un ítem (clase A) concentra' : `${cuantosA} ítems (clase A) concentran`
          } el 80 % de lo invertido: son los que más conviene vigilar`}
          tabla={
            <TablaDatos
              filas={abc}
              clave={(b) => b.nombre}
              columnas={[
                { titulo: 'Ítem', celda: (b) => b.nombre },
                { titulo: 'Tipo', celda: (b) => tipoDe.get(b.nombre) ?? '—' },
                { titulo: 'Costo ingresado', numerica: true, celda: (b) => formatearBs(b.valor) },
                { titulo: '% del total', numerica: true, celda: (b) => formatearPorcentaje(b.porcentaje) },
                { titulo: '% acumulado', numerica: true, celda: (b) => formatearPorcentaje(b.acumulado) },
                { titulo: 'Clase', celda: (b) => b.clase },
              ]}
            />
          }
        >
          <Pareto barras={abc} formatear={formatearBs} etiqueta="Análisis ABC: costo ingresado por ítem" />
        </TarjetaGrafico>
      )}

      {motivos.length > 1 && (
        <TarjetaGrafico
          ancho
          tipo="Gráfico de torta"
          titulo="¿Por qué se movió el inventario?"
          descripcion="Los movimientos del período según su motivo: compras, producción, ventas, ajustes…"
          tabla={
            <TablaDatos
              filas={motivos}
              clave={(m) => m.nombre}
              columnas={[
                { titulo: 'Motivo', celda: (m) => m.nombre },
                { titulo: 'Movimientos', numerica: true, celda: (m) => m.valor },
              ]}
            />
          }
        >
          <Torta
            partes={motivos}
            formatear={(n) => plural(n, 'movimiento', 'movimientos')}
            centro={{ valor: String(reporte.movimientos.length), texto: 'movimientos' }}
            etiqueta="Torta: movimientos del inventario por motivo"
          />
        </TarjetaGrafico>
      )}
    </Tablero>
  );
}
