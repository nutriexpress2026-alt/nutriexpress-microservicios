'use client';

import { useId, useMemo, type ReactElement } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import {
  COLOR_MARCA,
  COLOR_OTROS,
  COLOR_PERDIDA,
  COLOR_SERIE,
  Leyenda,
  Recuadro,
  TEXTO_EJE,
  formaBarra,
  formatearCompacto,
  normalizar,
  recortar,
  textoSobre,
  useAngosto,
  useEstable,
  useMovimientoReducido,
  type Parte,
  type Rectangulo,
} from './Graficos';
import type { BarraPareto, ClaseHistograma } from '@/lib/series';
import { formatearPorcentaje } from '@/lib/formato';

/**
 * Los gráficos estadísticos de los reportes. Cada uno responde una pregunta que
 * las barras no responden bien:
 *
 * - **Área**: la tendencia del período (cómo sube y baja día a día).
 * - **Ojiva**: lo acumulado (a qué ritmo se llegó al total; qué parte de los
 *   pedidos llega antes de cierto tiempo).
 * - **Diagrama de Pareto (ABC)**: qué pocos productos o insumos hacen el 80 %.
 * - **Histograma y polígono de frecuencias**: cómo se reparten valores que se
 *   miden (los minutos de entrega), en clases de la regla de Sturges.
 * - **Burbujas**: tres medidas a la vez (unidades, margen e importe).
 * - **Torta**: cómo se divide un total en pocas partes.
 * - **Radar**: el ciclo de la semana.
 * - **Embudo**: cuántos llegan a cada etapa de un recorrido.
 * - **Mapa de árbol**: en qué se fue el dinero, con el tamaño de cada parte.
 */

/** Un id que sirve dentro de `url(#…)` (el de React trae dos puntos). */
function useIdSvg() {
  return useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Cómo se ve una cifra marcada en un gráfico: chica y en el color del texto. */
const TEXTO_CIFRA = { fontSize: 11, fill: 'var(--color-tinta)' };

/** Para el recuadro: el dato de la fila sobre la que está el ratón. */
const datoDe = <T,>(payload: unknown): T | undefined =>
  (payload as { payload?: T }[] | undefined)?.[0]?.payload;

/** El ordinal de una clase ABC: el mismo tono de marca, más tenue cuanto menos pesa. */
const COLOR_CLASE: Record<BarraPareto['clase'], string> = {
  A: COLOR_MARCA,
  B: `color-mix(in srgb, ${COLOR_MARCA} 55%, transparent)`,
  C: `color-mix(in srgb, ${COLOR_MARCA} 25%, transparent)`,
};

/* ------------------------------------------------------------------ */
/* Área en el tiempo                                                   */
/* ------------------------------------------------------------------ */

export interface PuntoArea {
  etiqueta: string;
  etiquetaLarga: string;
  valor: number;
  notas?: string[];
}

/**
 * La línea del período con el área debajo, que se lee como «cuánto» de un
 * vistazo. Solo el punto más alto lleva su cifra.
 */
export function AreaEnElTiempo({
  puntos,
  formatear,
  nombre,
  etiqueta,
}: {
  puntos: PuntoArea[];
  formatear: (valor: number) => string;
  /** Qué es el valor, para el recuadro («vendido»). */
  nombre: string;
  etiqueta: string;
}) {
  const reducido = useMovimientoReducido();
  const datos = useEstable(puntos);
  const degradado = useIdSvg();
  const maximo = Math.max(...datos.map((p) => p.valor), 0);
  const indiceMaximo = maximo > 0 ? datos.findIndex((p) => p.valor === maximo) : -1;

  return (
    <div role="figure" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 600, height: 260 }}>
        <AreaChart data={datos} margin={{ top: 22, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={degradado} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_MARCA} stopOpacity={0.32} />
              <stop offset="100%" stopColor={COLOR_MARCA} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-borde)" />
          <XAxis
            dataKey="etiqueta"
            tick={TEXTO_EJE}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-borde-fuerte)' }}
            interval="preserveStartEnd"
            minTickGap={14}
          />
          <YAxis tick={TEXTO_EJE} tickLine={false} axisLine={false} width={48} tickCount={5} tickFormatter={formatearCompacto} />
          <Tooltip
            cursor={{ stroke: 'var(--color-borde-fuerte)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = datoDe<PuntoArea>(payload);
              if (!active || !p) return null;
              return <Recuadro titulo={p.etiquetaLarga} filas={[{ valor: formatear(p.valor), nombre }]} notas={p.notas} />;
            }}
          />
          <Area
            type="monotone"
            dataKey="valor"
            stroke={COLOR_MARCA}
            strokeWidth={2}
            fill={`url(#${degradado})`}
            dot={false}
            activeDot={{ r: 5, fill: COLOR_MARCA, stroke: 'var(--color-superficie)', strokeWidth: 2 }}
            isAnimationActive={!reducido}
          >
            {indiceMaximo >= 0 && (
              <LabelList
                content={(props) => {
                  const { index, x, y } = props as { index?: number; x?: number; y?: number };
                  if (index !== indiceMaximo || x === undefined || y === undefined) return <g />;
                  return (
                    <text x={x} y={y - 9} textAnchor="middle" {...TEXTO_CIFRA}>
                      {formatear(maximo)}
                    </text>
                  );
                }}
              />
            )}
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ojiva                                                               */
/* ------------------------------------------------------------------ */

export interface PuntoOjiva {
  /** En el eje: el día, o el límite superior de la clase. */
  etiqueta: string;
  /** Lo acumulado hasta ese punto. */
  valor: number;
  /** Título del recuadro. */
  titulo: string;
  notas?: string[];
}

/**
 * La curva de lo acumulado: siempre sube, y lo empinado de cada tramo dice
 * cuánto se sumó ahí. Con `referencia` se marca una línea (la mitad del total,
 * la mediana) para leer en qué punto se cruza.
 */
export function Ojiva({
  puntos,
  formatear,
  formatearEje = formatearCompacto,
  nombre,
  referencia,
  maximoEje,
  etiqueta,
}: {
  puntos: PuntoOjiva[];
  formatear: (valor: number) => string;
  formatearEje?: (valor: number) => string;
  nombre: string;
  referencia?: { valor: number; etiqueta: string };
  /** Tope del eje (100 en porcentajes). */
  maximoEje?: number;
  etiqueta: string;
}) {
  const reducido = useMovimientoReducido();
  const datos = useEstable(puntos);
  const degradado = useIdSvg();

  return (
    <div role="figure" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height={250} initialDimension={{ width: 500, height: 250 }}>
        <AreaChart data={datos} margin={{ top: 14, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={degradado} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_SERIE[0]} stopOpacity={0.22} />
              <stop offset="100%" stopColor={COLOR_SERIE[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-borde)" />
          <XAxis
            dataKey="etiqueta"
            tick={TEXTO_EJE}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-borde-fuerte)' }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={TEXTO_EJE}
            tickLine={false}
            axisLine={false}
            width={48}
            tickCount={5}
            domain={[0, maximoEje ?? 'auto']}
            tickFormatter={formatearEje}
          />
          {referencia && (
            <ReferenceLine
              y={referencia.valor}
              stroke="var(--color-tinta-tenue)"
              strokeDasharray="4 4"
              label={{ value: referencia.etiqueta, position: 'insideTopLeft', ...TEXTO_EJE }}
            />
          )}
          <Tooltip
            cursor={{ stroke: 'var(--color-borde-fuerte)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = datoDe<PuntoOjiva>(payload);
              if (!active || !p) return null;
              return <Recuadro titulo={p.titulo} filas={[{ valor: formatear(p.valor), nombre }]} notas={p.notas} />;
            }}
          />
          {/* Tramos rectos y no curvos: la ojiva une puntos medidos. */}
          <Area
            type="linear"
            dataKey="valor"
            stroke={COLOR_SERIE[0]}
            strokeWidth={2}
            fill={`url(#${degradado})`}
            dot={{ r: 3.5, fill: COLOR_SERIE[0], stroke: 'var(--color-superficie)', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: COLOR_SERIE[0], stroke: 'var(--color-superficie)', strokeWidth: 2 }}
            isAnimationActive={!reducido}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Diagrama de Pareto (ABC)                                            */
/* ------------------------------------------------------------------ */

/**
 * Barras de mayor a menor con su porcentaje y la línea del acumulado, sobre un
 * mismo eje de 0 a 100 %. Donde la línea cruza el 80 % terminan los de la clase
 * A: los pocos que hacen la mayor parte.
 */
export function Pareto({
  barras,
  formatear,
  etiqueta,
}: {
  barras: BarraPareto[];
  formatear: (valor: number) => string;
  etiqueta: string;
}) {
  const reducido = useMovimientoReducido();
  const angosto = useAngosto();
  const datos = useEstable(barras);
  const forma = useMemo(() => formaBarra('columna', () => false), []);
  const clases = (['A', 'B', 'C'] as const).filter((c) => datos.some((b) => b.clase === c));

  return (
    <div role="figure" aria-label={etiqueta}>
      <Leyenda
        series={[
          ...clases.map((c) => ({ nombre: `Clase ${c}`, color: COLOR_CLASE[c] })),
          { nombre: '% acumulado', color: COLOR_SERIE[1], forma: 'linea' as const },
        ]}
      />
      <ResponsiveContainer width="100%" height={310} initialDimension={{ width: 700, height: 310 }}>
        {/* Margen a la izquierda: el primer nombre, inclinado, se sale del borde. */}
        <ComposedChart data={datos} margin={{ top: 12, right: 12, bottom: 0, left: 28 }}>
          <CartesianGrid vertical={false} stroke="var(--color-borde)" />
          <XAxis
            dataKey="nombre"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-borde-fuerte)' }}
            height={angosto ? 64 : 58}
            tick={(props) => {
              const { x, y, payload } = props as { x?: number | string; y?: number | string; payload?: { value?: unknown } };
              const nombre = String(payload?.value ?? '');
              return (
                <text x={x} y={y} dy={10} textAnchor="end" transform={`rotate(-38 ${x} ${y})`} {...TEXTO_EJE}>
                  <title>{nombre}</title>
                  {recortar(nombre, angosto ? 9 : 14)}
                </text>
              );
            }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            tick={TEXTO_EJE}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => `${v} %`}
          />
          <ReferenceLine
            y={80}
            stroke="var(--color-tinta-tenue)"
            strokeDasharray="4 4"
            label={{ value: '80 %', position: 'insideTopRight', ...TEXTO_EJE }}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-superficie-suave)', opacity: 0.6 }}
            content={({ active, payload }) => {
              const b = datoDe<BarraPareto>(payload);
              if (!active || !b) return null;
              return (
                <Recuadro
                  titulo={b.nombre}
                  filas={[
                    { valor: formatear(b.valor), nombre: '' },
                    { valor: formatearPorcentaje(b.porcentaje), nombre: 'del total' },
                    { valor: formatearPorcentaje(b.acumulado), nombre: 'acumulado' },
                  ]}
                  notas={[`Clase ${b.clase}`, ...(b.detalle ?? [])]}
                />
              );
            }}
          />
          <Bar dataKey="porcentaje" maxBarSize={36} shape={forma} isAnimationActive={!reducido}>
            {datos.map((b) => (
              <Cell key={b.nombre} fill={COLOR_CLASE[b.clase]} />
            ))}
          </Bar>
          <Line
            type="linear"
            dataKey="acumulado"
            stroke={COLOR_SERIE[1]}
            strokeWidth={2}
            dot={{ r: 3.5, fill: COLOR_SERIE[1], stroke: 'var(--color-superficie)', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: COLOR_SERIE[1], stroke: 'var(--color-superficie)', strokeWidth: 2 }}
            isAnimationActive={!reducido}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Histograma y polígono de frecuencias                                */
/* ------------------------------------------------------------------ */

/**
 * Las clases como barras pegadas (histograma) y, encima, la línea que une sus
 * marcas de clase (polígono de frecuencias). El polígono empieza y termina en
 * cero, en una clase vacía a cada lado, como se dibuja a mano.
 */
export function HistogramaPoligono({
  clases,
  unidad,
  nombre,
  etiqueta,
}: {
  clases: ClaseHistograma[];
  /** Unidad de la variable («min»). */
  unidad: string;
  /** Qué se cuenta («pedidos»). */
  nombre: string;
  etiqueta: string;
}) {
  const reducido = useMovimientoReducido();
  const forma = useMemo(() => formaBarra('columna', () => false, true), []);
  const datos = useEstable(
    useMemo(() => {
      if (clases.length === 0) return [];
      const ancho = clases[0].hasta - clases[0].desde;
      const vacia = (desde: number) => ({
        desde,
        hasta: desde + ancho,
        marca: desde + ancho / 2,
        etiqueta: '',
        frecuencia: 0,
        relativa: 0,
        acumulada: 0,
        porcentajeAcumulado: 0,
        vacia: true,
      });
      return [vacia(clases[0].desde - ancho), ...clases, vacia(clases[clases.length - 1].hasta)];
    }, [clases]),
  );

  return (
    <div role="figure" aria-label={etiqueta}>
      <Leyenda
        series={[
          { nombre: 'Histograma', color: COLOR_MARCA },
          { nombre: 'Polígono de frecuencias', color: COLOR_SERIE[1], forma: 'linea' },
        ]}
      />
      <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 500, height: 260 }}>
        <ComposedChart data={datos} margin={{ top: 14, right: 12, bottom: 0, left: 0 }} barCategoryGap={0} barGap={0}>
          <CartesianGrid vertical={false} stroke="var(--color-borde)" />
          <XAxis
            dataKey="etiqueta"
            interval={0}
            tick={{ ...TEXTO_EJE, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-borde-fuerte)' }}
          />
          <YAxis tick={TEXTO_EJE} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--color-superficie-suave)', opacity: 0.6 }}
            content={({ active, payload }) => {
              const c = datoDe<ClaseHistograma & { vacia?: boolean }>(payload);
              if (!active || !c || c.vacia) return null;
              return (
                <Recuadro
                  titulo={`De ${c.desde} a ${c.hasta} ${unidad}`}
                  filas={[
                    { valor: String(c.frecuencia), nombre },
                    { valor: formatearPorcentaje(c.relativa), nombre: 'del total' },
                  ]}
                  notas={[`${formatearPorcentaje(c.porcentajeAcumulado)} acumulado hasta ${c.hasta} ${unidad}`]}
                />
              );
            }}
          />
          <Bar dataKey="frecuencia" fill={COLOR_MARCA} shape={forma} isAnimationActive={!reducido} />
          <Line
            type="linear"
            dataKey="frecuencia"
            stroke={COLOR_SERIE[1]}
            strokeWidth={2}
            dot={{ r: 4, fill: COLOR_SERIE[1], stroke: 'var(--color-superficie)', strokeWidth: 2 }}
            activeDot={false}
            isAnimationActive={!reducido}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Burbujas                                                            */
/* ------------------------------------------------------------------ */

export interface Burbuja {
  nombre: string;
  /** Eje horizontal. */
  x: number;
  /** Eje vertical. */
  y: number;
  /** El tamaño de la burbuja. */
  z: number;
  notas?: string[];
}

/**
 * Tres medidas a la vez: dónde está la burbuja (x, y) y qué tan grande es (z).
 * Las líneas de referencia parten el plano en cuadrantes; con nombre escrito
 * van las burbujas más grandes, el resto se lee al pasar el ratón.
 */
export function Burbujas({
  puntos,
  ejeX,
  ejeY,
  formatearX,
  formatearY,
  formatearEjeY = formatearY,
  tamano,
  promedioY,
  etiqueta,
}: {
  puntos: Burbuja[];
  ejeX: string;
  ejeY: string;
  formatearX: (v: number) => string;
  formatearY: (v: number) => string;
  /** Para las marcas del eje vertical: más cortas (sin decimales). */
  formatearEjeY?: (v: number) => string;
  /** Qué mide el tamaño de la burbuja. */
  tamano: string;
  /** Una línea de referencia horizontal (el margen promedio). */
  promedioY?: number;
  etiqueta: string;
}) {
  const reducido = useMovimientoReducido();
  const angosto = useAngosto();
  const datos = useEstable(puntos);
  // Solo las cuatro más grandes llevan su nombre: con todas, se pisan. En el
  // teléfono, ninguna: no hay lugar, y se leen al tocar la burbuja.
  const conNombre = useMemo(
    () =>
      new Set(angosto ? [] : [...datos].sort((a, b) => b.z - a.z).slice(0, 4).map((p) => p.nombre)),
    [datos, angosto],
  );
  const conNegativos = datos.some((p) => p.y < 0);
  // Aire alrededor: una burbuja grande en el borde quedaría cortada. Los bordes
  // caen en decenas, para que las marcas del eje sean números redondos.
  const holgura = (v: number) => Math.max(Math.abs(v) * 0.12, 5);
  const abajo = (v: number) => Math.floor(v / 10) * 10;
  const arriba = (v: number) => Math.ceil(v / 10) * 10;

  return (
    <div role="figure" aria-label={etiqueta}>
      {/* Qué es cada eje, escrito: el gráfico de burbujas no se adivina. */}
      <p className="mb-1 flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-tinta-suave">
        <span>→ {ejeX}</span>
        <span>↑ {ejeY}</span>
        <span>◯ Tamaño: {tamano}</span>
      </p>
      <ResponsiveContainer width="100%" height={320} initialDimension={{ width: 600, height: 320 }}>
        <ScatterChart margin={{ top: 22, right: 28, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--color-borde)" />
          <XAxis
            type="number"
            dataKey="x"
            name={ejeX}
            tick={TEXTO_EJE}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-borde-fuerte)' }}
            domain={[0, (max: number) => arriba(max + holgura(max))]}
            tickFormatter={formatearX}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={ejeY}
            tick={TEXTO_EJE}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={[
              (min: number) => abajo(Math.min(min, 0) - (min < 0 ? holgura(min) : 0)),
              (max: number) => arriba(max + holgura(max)),
            ]}
            tickFormatter={(v: number) => formatearEjeY(v)}
          />
          <ZAxis type="number" dataKey="z" range={[90, 1600]} />
          {conNegativos && <ReferenceLine y={0} stroke="var(--color-borde-fuerte)" />}
          {promedioY !== undefined && (
            <ReferenceLine
              y={promedioY}
              stroke="var(--color-tinta-tenue)"
              strokeDasharray="4 4"
              label={{ value: `Promedio ${formatearY(promedioY)}`, position: 'insideTopRight', ...TEXTO_EJE }}
            />
          )}
          <Tooltip
            cursor={{ stroke: 'var(--color-borde-fuerte)' }}
            content={({ active, payload }) => {
              const p = datoDe<Burbuja>(payload);
              if (!active || !p) return null;
              return (
                <Recuadro
                  titulo={p.nombre}
                  filas={[
                    { valor: formatearX(p.x), nombre: ejeX.toLowerCase() },
                    { valor: formatearY(p.y), nombre: ejeY.toLowerCase() },
                  ]}
                  notas={p.notas}
                />
              );
            }}
          />
          <Scatter data={datos} isAnimationActive={!reducido}>
            {datos.map((p) => (
              <Cell
                key={p.nombre}
                fill={p.y < 0 ? COLOR_PERDIDA : COLOR_MARCA}
                fillOpacity={0.72}
                stroke="var(--color-superficie)"
                strokeWidth={2}
              />
            ))}
            <LabelList
              content={(props) => {
                const { x, y, index, width } = props as { x?: number; y?: number; index?: number; width?: number };
                const p = index === undefined ? undefined : datos[index];
                if (!p || !conNombre.has(p.nombre) || x === undefined || y === undefined) return <g />;
                return (
                  <text x={x + (width ?? 0) / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="var(--color-tinta-suave)">
                    {recortar(p.nombre, 16)}
                  </text>
                );
              }}
            />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Torta                                                               */
/* ------------------------------------------------------------------ */

const RADIANES = Math.PI / 180;

/**
 * Una torta con hueco (dona): el total al centro y cada parte con su
 * porcentaje donde cabe. Al lado, la leyenda con el monto de cada una. Más de
 * ocho partes ya no se distinguen: lo que sobra se suma en «Otros».
 */
export function Torta({
  partes,
  formatear,
  centro,
  etiqueta,
}: {
  partes: Parte[];
  formatear: (valor: number) => string;
  /** Lo que va escrito en el hueco: el total y qué es. */
  centro: { valor: string; texto: string };
  etiqueta: string;
}) {
  const reducido = useMovimientoReducido();
  const datos = useEstable(partes.filter((p) => p.valor > 0));
  const total = datos.reduce((s, p) => s + p.valor, 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  return (
    <div role="figure" aria-label={etiqueta} className="flex flex-col items-center gap-4 px-2 sm:flex-row sm:items-center">
      <div className="relative h-56 w-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 224, height: 224 }}>
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                const p = datoDe<Parte>(payload);
                if (!active || !p) return null;
                return (
                  <Recuadro
                    titulo={p.nombre}
                    filas={[
                      { valor: formatear(p.valor), nombre: '' },
                      { valor: formatearPorcentaje(pct(p.valor)), nombre: 'del total' },
                    ]}
                    notas={p.detalle ? [p.detalle] : undefined}
                  />
                );
              }}
            />
            <Pie
              data={datos}
              dataKey="valor"
              nameKey="nombre"
              innerRadius="58%"
              outerRadius="96%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--color-superficie)"
              strokeWidth={2}
              isAnimationActive={!reducido}
              labelLine={false}
              label={(props: unknown) => {
                const { cx, cy, midAngle, innerRadius, outerRadius, percent, index } = props as {
                  cx: number;
                  cy: number;
                  midAngle: number;
                  innerRadius: number;
                  outerRadius: number;
                  percent: number;
                  index: number;
                };
                // Solo donde cabe: en una tajada angosta, cortado no se lee.
                if (percent < 0.07) return <g />;
                const r = innerRadius + (outerRadius - innerRadius) / 2;
                return (
                  <text
                    x={cx + r * Math.cos(-midAngle * RADIANES)}
                    y={cy + r * Math.sin(-midAngle * RADIANES)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={600}
                    fill={textoSobre(datos[index]?.color ?? '')}
                  >
                    {Math.round(percent * 100)} %
                  </text>
                );
              }}
            >
              {datos.map((p) => (
                <Cell key={p.nombre} fill={p.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-base font-semibold text-tinta">{centro.valor}</span>
          <span className="text-[11px] text-tinta-tenue">{centro.texto}</span>
        </div>
      </div>

      {/* Dos renglones por parte: el nombre con su monto, y debajo el porcentaje.
          En uno solo, al lado de la torta, los nombres quedaban cortados. */}
      <ul className="w-full min-w-0 flex-1 space-y-2.5">
        {datos.map((p) => (
          <li key={p.nombre} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-tinta-suave">
                <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
                <span className="truncate" title={p.nombre}>
                  {p.nombre}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-tinta">{formatear(p.valor)}</span>
            </div>
            <p className="pl-[18px] text-xs text-tinta-tenue">
              {formatearPorcentaje(pct(p.valor))}
              {p.detalle ? ` · ${p.detalle}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Las partes con su color en el orden fijo de la paleta; pasada la octava, el
 * resto se suma en «Otros» (gris), para no inventar un noveno color.
 */
export function partesConColor(
  partes: { nombre: string; valor: number; detalle?: string }[],
  maximo = 8,
): Parte[] {
  const ordenadas = [...partes].filter((p) => p.valor > 0).sort((a, b) => b.valor - a.valor);
  const visibles = ordenadas.length <= maximo ? ordenadas : ordenadas.slice(0, maximo - 1);
  const resto = ordenadas.slice(visibles.length);
  return [
    ...visibles.map((p, i) => ({ ...p, color: COLOR_SERIE[i] })),
    ...(resto.length
      ? [
          {
            nombre: `Otros (${resto.length})`,
            valor: Math.round(resto.reduce((s, p) => s + p.valor, 0) * 100) / 100,
            color: COLOR_OTROS,
          },
        ]
      : []),
  ];
}

/* ------------------------------------------------------------------ */
/* Radar de la semana                                                  */
/* ------------------------------------------------------------------ */

export interface PuntoSemana {
  /** «Lun». */
  corto: string;
  /** «Lunes». */
  dia: string;
  valor: number;
  notas?: string[];
}

/**
 * Los siete días alrededor de un centro: cuanto más lejos llega la figura,
 * más se vende ese día. Muestra el ciclo de la semana de un vistazo.
 */
export function RadarSemana({
  puntos,
  formatear,
  nombre,
  etiqueta,
}: {
  puntos: PuntoSemana[];
  formatear: (valor: number) => string;
  nombre: string;
  etiqueta: string;
}) {
  const reducido = useMovimientoReducido();
  const datos = useEstable(puntos);

  return (
    <div role="figure" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height={270} initialDimension={{ width: 400, height: 270 }}>
        <RadarChart data={datos} outerRadius="74%" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <PolarGrid stroke="var(--color-borde-fuerte)" />
          <PolarAngleAxis dataKey="corto" tick={{ ...TEXTO_EJE, fontSize: 12 }} />
          {/* La escala va entre el lunes y el martes, no encima del nombre del lunes. */}
          <PolarRadiusAxis
            angle={90 - 360 / 14}
            tick={{ ...TEXTO_EJE, fontSize: 10 }}
            axisLine={false}
            tickFormatter={formatearCompacto}
            tickCount={4}
          />
          <Tooltip
            content={({ active, payload }) => {
              const p = datoDe<PuntoSemana>(payload);
              if (!active || !p) return null;
              return <Recuadro titulo={p.dia} filas={[{ valor: formatear(p.valor), nombre }]} notas={p.notas} />;
            }}
          />
          <Radar
            dataKey="valor"
            stroke={COLOR_MARCA}
            strokeWidth={2}
            fill={COLOR_MARCA}
            fillOpacity={0.2}
            dot={{ r: 3.5, fill: COLOR_MARCA, stroke: 'var(--color-superficie)', strokeWidth: 2 }}
            isAnimationActive={!reducido}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Embudo                                                              */
/* ------------------------------------------------------------------ */

export interface Etapa {
  nombre: string;
  valor: number;
  notas?: string[];
}

/**
 * Las etapas de un recorrido, de la primera a la última: cada franja tan ancha
 * como los que llegaron hasta ahí. Lo que se angosta entre una y otra es lo que
 * quedó en el camino.
 */
export function Embudo({ etapas, nombre, etiqueta }: { etapas: Etapa[]; nombre: string; etiqueta: string }) {
  const reducido = useMovimientoReducido();
  const datos = useEstable(etapas);
  const primero = datos[0]?.valor ?? 0;
  // La misma marca, más tenue en cada etapa: es un orden, no grupos distintos.
  const color = (i: number) =>
    `color-mix(in srgb, ${COLOR_MARCA} ${Math.round(100 - (i * 55) / Math.max(datos.length - 1, 1))}%, transparent)`;

  return (
    <div role="figure" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height={datos.length * 46 + 16} initialDimension={{ width: 500, height: datos.length * 46 + 16 }}>
        <FunnelChart margin={{ top: 8, right: 150, bottom: 8, left: 8 }}>
          <Tooltip
            content={({ active, payload }) => {
              const e = datoDe<Etapa>(payload);
              if (!active || !e) return null;
              return (
                <Recuadro
                  titulo={e.nombre}
                  filas={[
                    { valor: String(e.valor), nombre },
                    { valor: formatearPorcentaje(primero ? (e.valor / primero) * 100 : 0), nombre: 'de los que entraron' },
                  ]}
                  notas={e.notas}
                />
              );
            }}
          />
          <Funnel
            data={datos}
            dataKey="valor"
            nameKey="nombre"
            lastShapeType="rectangle"
            stroke="var(--color-superficie)"
            strokeWidth={2}
            isAnimationActive={!reducido}
          >
            {datos.map((e, i) => (
              <Cell key={e.nombre} fill={color(i)} />
            ))}
            <LabelList
              content={(props) => {
                const { x, y, width, height, index } = props as Rectangulo & { index?: number };
                const e = index === undefined ? undefined : datos[index];
                if (!e || x === undefined || y === undefined) return <g />;
                const { x: x0, y: y0, w, h } = normalizar({ x, y, width, height });
                const pct = primero ? Math.round((e.valor / primero) * 100) : 0;
                return (
                  <g>
                    <text x={x0 + w + 10} y={y0 + h / 2} dominantBaseline="central" {...TEXTO_EJE} fill="var(--color-tinta-suave)">
                      {e.nombre}
                    </text>
                    <text x={x0 + w / 2} y={y0 + h / 2} dominantBaseline="central" textAnchor="middle" {...TEXTO_CIFRA}>
                      {e.valor} · {pct} %
                    </text>
                  </g>
                );
              }}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mapa de árbol                                                       */
/* ------------------------------------------------------------------ */

/**
 * Cada parte es un rectángulo con área proporcional a su valor: lo grande se
 * ve grande sin leer un número. El nombre y el monto van escritos donde caben;
 * los rectángulos chicos se leen al pasar el ratón o en la tabla.
 */
export function MapaArbol({
  partes,
  formatear,
  etiqueta,
}: {
  partes: Parte[];
  formatear: (valor: number) => string;
  etiqueta: string;
}) {
  const reducido = useMovimientoReducido();
  const datos = useEstable(partes.map((p) => ({ ...p, name: p.nombre, size: p.valor })));
  const porNombre = useMemo(() => new Map(datos.map((p) => [p.nombre, p])), [datos]);

  const Recuadrito = (props: unknown): ReactElement => {
    const { x, y, width, height, name, depth } = props as Rectangulo & { name?: string; depth?: number };
    const p = name ? porNombre.get(name) : undefined;
    if (depth === 0 || !p || x === undefined || y === undefined || !width || !height) return <g />;
    const texto = textoSobre(p.color);
    const cabe = width > 74 && height > 38;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={4} fill={p.color} stroke="var(--color-superficie)" strokeWidth={2} />
        {cabe && (
          <>
            <text x={x + 8} y={y + 17} fontSize={11} fontWeight={600} fill={texto}>
              {recortar(p.nombre, Math.max(Math.floor((width - 16) / 6.4), 4))}
            </text>
            <text x={x + 8} y={y + 32} fontSize={11} fill={texto} className="tabular-nums">
              {formatear(p.valor)}
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <div role="figure" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height={290} initialDimension={{ width: 500, height: 290 }}>
        <Treemap
          data={datos}
          dataKey="size"
          nameKey="name"
          aspectRatio={4 / 3}
          isAnimationActive={!reducido}
          content={Recuadrito}
        >
          <Tooltip
            content={({ active, payload }) => {
              const nombreParte = datoDe<{ name?: string }>(payload)?.name;
              const p = nombreParte ? porNombre.get(nombreParte) : undefined;
              if (!active || !p) return null;
              const total = datos.reduce((s, d) => s + d.valor, 0);
              return (
                <Recuadro
                  titulo={p.nombre}
                  filas={[
                    { valor: formatear(p.valor), nombre: '' },
                    { valor: formatearPorcentaje(total ? (p.valor / total) * 100 : 0), nombre: 'del total' },
                  ]}
                  notas={p.detalle ? [p.detalle] : undefined}
                />
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
