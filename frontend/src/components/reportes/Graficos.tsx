'use client';

import { useMemo, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartColumn, Table2 } from 'lucide-react';
import type { BarraRanking, PuntoTiempo } from '@/lib/series';

/**
 * Los gráficos de los reportes (Recharts): la tarjeta, las piezas comunes y los
 * gráficos de barras. Los estadísticos (ojiva, Pareto, histograma, burbujas,
 * torta, radar, embudo, mapa de árbol) están en `GraficosEstadisticos.tsx`.
 *
 * - **Columnas en el tiempo**: cómo fue cada día del período, apiladas cuando
 *   el día se divide en partes (entregados, en curso, cancelados).
 * - **Ranking**: qué vendió o costó más, de mayor a menor. Con valores negativos
 *   (la ganancia) las barras crecen a los dos lados del cero.
 * - **Lista de avance**: cuánto de lo suyo cumplió cada uno (los repartidores).
 *
 * Todos van en una `TarjetaGrafico`, que tiene al lado la vista de tabla con
 * las mismas cifras: lo que dice el gráfico se puede leer también sin ver los
 * colores y sin pasar el ratón por encima.
 *
 * Los colores salen del tema (`--color-marca-400` y `--grafico-1..8`, ver
 * `globals.css`): el gráfico cambia con el tema y el modo de la cuenta.
 */

/** El color de una serie sola: el de la marca del tema. */
export const COLOR_MARCA = 'var(--color-marca-400)';
export const COLOR_PERDIDA = 'var(--color-peligro)';
export const COLOR_OTROS = 'var(--color-tinta-tenue)';
export const TEXTO_EJE = { fill: 'var(--color-tinta-suave)', fontSize: 11 };

/**
 * Los colores de lo que tiene identidad propia, en su orden fijo (validado de a
 * pares vecinos). Pasado el octavo, lo que sobra se suma en «Otros».
 */
export const COLOR_SERIE = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--grafico-${n})`);

/**
 * Cada método de pago con su color, siempre el mismo: si un filtro deja solo
 * el QR, el QR no cambia de color.
 */
const COLOR_METODO: Record<string, string> = {
  Efectivo: COLOR_SERIE[0],
  QR: COLOR_SERIE[1],
  Tarjeta: COLOR_SERIE[2],
};
export const colorMetodoPago = (metodo: string) => COLOR_METODO[metodo] ?? COLOR_SERIE[3];

const compacto = new Intl.NumberFormat('es-BO', { notation: 'compact', maximumFractionDigits: 1 });
/** «1,2 mil», para los ejes. */
export const formatearCompacto = (valor: number) => compacto.format(valor);

/* ------------------------------------------------------------------ */
/* Movimiento reducido                                                 */
/* ------------------------------------------------------------------ */

const consultaMovimiento = '(prefers-reduced-motion: reduce)';

function suscribirMovimiento(avisar: () => void) {
  const consulta = window.matchMedia?.(consultaMovimiento);
  consulta?.addEventListener('change', avisar);
  return () => consulta?.removeEventListener('change', avisar);
}

/** Quien pidió menos movimiento al sistema ve los gráficos sin animación. */
export function useMovimientoReducido(): boolean {
  return useSyncExternalStore(
    suscribirMovimiento,
    () => window.matchMedia?.(consultaMovimiento).matches ?? false,
    () => false,
  );
}

/**
 * El mismo objeto mientras su contenido no cambie.
 *
 * Las pantallas arman los datos de cada gráfico en cada dibujo (por ejemplo, con
 * cada tecla en el diálogo del correo). Para Recharts un arreglo nuevo es un
 * dato nuevo: vuelve a animar las barras y esconde las cifras mientras tanto.
 */
export function useEstable<T>(valor: T): T {
  const clave = JSON.stringify(valor);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- se compara por contenido
  return useMemo(() => valor, [clave]);
}

const consultaAngosta = '(max-width: 480px)';

function suscribirAncho(avisar: () => void) {
  const consulta = window.matchMedia?.(consultaAngosta);
  consulta?.addEventListener('change', avisar);
  return () => consulta?.removeEventListener('change', avisar);
}

/** En un teléfono los nombres se cortan antes, para que quede lugar a las barras. */
export function useAngosto(): boolean {
  return useSyncExternalStore(
    suscribirAncho,
    () => window.matchMedia?.(consultaAngosta).matches ?? false,
    () => false,
  );
}

/* ------------------------------------------------------------------ */
/* Tarjeta con vista de gráfico o de tabla                             */
/* ------------------------------------------------------------------ */

export function TarjetaGrafico({
  titulo,
  tipo,
  descripcion,
  tabla,
  ancho = false,
  children,
}: {
  /** La pregunta que responde, en palabras de quien la hace. */
  titulo: string;
  /** El nombre del gráfico («Ojiva», «Diagrama de Pareto»), al lado del título. */
  tipo?: string;
  /** Qué se mide y en qué unidad. */
  descripcion?: string;
  /** Las mismas cifras en una tabla (`TablaDatos`). */
  tabla: ReactNode;
  /** Ocupa las dos columnas del tablero (los gráficos en el tiempo). */
  ancho?: boolean;
  children: ReactNode;
}) {
  const [vista, setVista] = useState<'grafico' | 'tabla'>('grafico');

  return (
    <section
      className={`superficie-tarjeta flex min-w-0 flex-col overflow-hidden rounded-2xl ${
        ancho ? 'lg:col-span-2' : ''
      }`}
    >
      {/* En pantallas anchas, sin saltar de línea: una descripción larga se acomoda
          en su columna y el botón Gráfico/Tabla queda arriba a la derecha. En el
          teléfono el botón baja, para que el título no quede en una tira angosta. */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-borde px-5 py-3.5 sm:flex-nowrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-tinta">
            {titulo}
            {tipo && (
              <span className="ml-2 inline-block rounded-md border border-borde px-1.5 py-px align-middle text-[10px] font-normal uppercase tracking-wider text-tinta-tenue">
                {tipo}
              </span>
            )}
          </h2>
          {descripcion && <p className="mt-0.5 text-xs text-tinta-tenue">{descripcion}</p>}
        </div>
        <div
          role="group"
          aria-label={`Ver «${titulo}» como`}
          className="flex shrink-0 rounded-lg border border-borde p-0.5 text-xs"
        >
          {(['grafico', 'tabla'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => setVista(v)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                vista === v
                  ? 'bg-superficie-suave text-tinta'
                  : 'text-tinta-tenue hover:text-tinta-suave'
              }`}
            >
              {v === 'grafico' ? (
                <ChartColumn className="size-3.5" aria-hidden />
              ) : (
                <Table2 className="size-3.5" aria-hidden />
              )}
              {v === 'grafico' ? 'Gráfico' : 'Tabla'}
            </button>
          ))}
        </div>
      </header>

      {vista === 'grafico' ? <div className="flex-1 px-3 pb-4 pt-4 sm:px-4">{children}</div> : tabla}
    </section>
  );
}

/** El tablero: dos columnas en pantallas anchas, una en el teléfono. */
export function Tablero({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 lg:grid-cols-2">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Piezas comunes                                                      */
/* ------------------------------------------------------------------ */

/** Una fila del recuadro: primero la cifra, que es lo que se busca. */
export interface FilaRecuadro {
  valor: string;
  nombre: string;
  /** Color de la serie: se marca con una rayita, no con el texto. */
  color?: string;
}

export function Recuadro({ titulo, filas, notas }: { titulo: string; filas: FilaRecuadro[]; notas?: string[] }) {
  return (
    <div className="min-w-40 rounded-xl border border-borde-fuerte bg-superficie-alta px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-medium text-tinta-suave first-letter:uppercase">{titulo}</p>
      <ul className="space-y-1">
        {filas.map((f) => (
          <li key={f.nombre} className="flex items-center gap-2">
            {f.color && (
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: f.color }} />
            )}
            <span className="font-semibold tabular-nums text-tinta">{f.valor}</span>
            <span className="text-tinta-suave">{f.nombre}</span>
          </li>
        ))}
      </ul>
      {notas?.map((n) => (
        <p key={n} className="mt-1 text-tinta-tenue">
          {n}
        </p>
      ))}
    </div>
  );
}

/** Leyenda: un cuadrito del color de la barra y el nombre en el color del texto. */
export function Leyenda({
  series,
}: {
  /** `linea`: la serie se dibuja como línea (el acumulado, el polígono); la marca de la leyenda también. */
  series: { nombre: string; color: string; forma?: 'cuadro' | 'linea' }[];
}) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-tinta-suave">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5">
          {s.forma === 'linea' ? (
            <span aria-hidden className="h-0.5 w-3.5 rounded-full" style={{ background: s.color }} />
          ) : (
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
          )}
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

/** Lo que Recharts entrega a una forma o a una etiqueta: interesa el rectángulo. */
export interface Rectangulo {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/** El rectángulo con ancho y alto positivos (para los negativos, Recharts los da al revés). */
export function normalizar({ x = 0, y = 0, width = 0, height = 0 }: Rectangulo) {
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    w: Math.abs(width),
    h: Math.abs(height),
  };
}

/**
 * Barra con la punta redondeada (4 px) del lado del dato y recta del lado del
 * cero, de donde crece. En las negativas la punta queda del otro lado.
 *
 * `separada`: en una columna apilada, cada parte lleva un borde del color de la
 * tarjeta, que deja 2 px de aire entre una parte y la siguiente.
 */
export function formaBarra(
  orientacion: 'columna' | 'barra',
  esNegativa: (dato: unknown) => boolean,
  separada = false,
) {
  return function FormaBarra(props: unknown): ReactElement {
    const p = props as Rectangulo & { fill?: string; payload?: unknown };
    const { x, y, w, h } = normalizar(p);
    if (w <= 0 || h <= 0) return <g />;
    const negativa = esNegativa(p.payload);
    const r = Math.min(4, w / 2, h / 2);
    const [x1, y1] = [x + w, y + h];

    let d: string;
    if (orientacion === 'columna') {
      d = negativa
        ? `M${x},${y} H${x1} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${x + r} Q${x},${y1} ${x},${y1 - r} Z`
        : `M${x},${y1} V${y + r} Q${x},${y} ${x + r},${y} H${x1 - r} Q${x1},${y} ${x1},${y + r} V${y1} Z`;
    } else {
      d = negativa
        ? `M${x1},${y} H${x + r} Q${x},${y} ${x},${y + r} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x1} Z`
        : `M${x},${y} H${x1 - r} Q${x1},${y} ${x1},${y + r} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${x} Z`;
    }
    return separada ? (
      <path d={d} fill={p.fill} stroke="var(--color-superficie)" strokeWidth={2} />
    ) : (
      <path d={d} fill={p.fill} />
    );
  };
}

/* ------------------------------------------------------------------ */
/* Columnas en el tiempo                                               */
/* ------------------------------------------------------------------ */

export interface SerieTiempo<V extends Record<string, number>> {
  clave: keyof V & string;
  nombre: string;
  color: string;
  /** Se dibuja hacia abajo del cero: las salidas frente a las entradas. */
  haciaAbajo?: boolean;
}

/**
 * Una columna por día (o por mes) del período.
 *
 * Solo la columna más alta lleva su cifra escrita: una cifra en cada columna
 * no la lee nadie. Las demás están en el recuadro al pasar el ratón y en la
 * tabla. Con dos series, una crece hacia arriba y la otra hacia abajo del cero.
 */
export function ColumnasEnElTiempo<V extends Record<string, number>>({
  datos,
  series,
  formatear,
  notas,
  etiqueta,
  enteros = false,
}: {
  datos: PuntoTiempo<V>[];
  series: SerieTiempo<V>[];
  formatear: (valor: number) => string;
  /** Líneas extra del recuadro de cada período. */
  notas?: (punto: PuntoTiempo<V>) => string[];
  /** Qué muestra el gráfico, para los lectores de pantalla. */
  etiqueta: string;
  /** El eje cuenta cosas enteras (ventas, pedidos): sin decimales. */
  enteros?: boolean;
}) {
  const reducido = useMovimientoReducido();
  const datosEstables = useEstable(datos);
  const seriesEstables = useEstable(series);
  const conNegativos = series.some((s) => s.haciaAbajo);

  // Las series hacia abajo se dibujan con su valor negativo; el recuadro y la
  // tabla las muestran en positivo.
  const filas = useMemo(
    () =>
      datosEstables.map((d) => {
        const fila: Record<string, number | string> = { ...d };
        for (const s of seriesEstables) if (s.haciaAbajo) fila[s.clave] = -d[s.clave];
        return fila;
      }),
    [datosEstables, seriesEstables],
  );
  const formas = useMemo(
    () =>
      seriesEstables.map((s) =>
        formaBarra('columna', () => Boolean(s.haciaAbajo), seriesEstables.length > 1),
      ),
    [seriesEstables],
  );

  const principal = series[0];
  const maximo = series.length === 1 ? Math.max(...datos.map((d) => d[principal.clave])) : 0;
  const indiceMaximo = maximo > 0 ? datos.findIndex((d) => d[principal.clave] === maximo) : -1;

  return (
    <div role="figure" aria-label={etiqueta}>
      {series.length > 1 && <Leyenda series={series} />}
      <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 600, height: 260 }}>
        <BarChart
          data={filas}
          margin={{ top: 22, right: 8, bottom: 0, left: 0 }}
          stackOffset={conNegativos ? 'sign' : undefined}
          barCategoryGap="18%"
        >
          <CartesianGrid vertical={false} stroke="var(--color-borde)" />
          <XAxis
            dataKey="etiqueta"
            tick={TEXTO_EJE}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-borde-fuerte)' }}
            interval="preserveStartEnd"
            minTickGap={14}
          />
          <YAxis
            tick={TEXTO_EJE}
            tickLine={false}
            axisLine={false}
            width={48}
            tickCount={5}
            allowDecimals={!enteros}
            tickFormatter={(v: number) => formatearCompacto(Math.abs(v))}
          />
          {conNegativos && <ReferenceLine y={0} stroke="var(--color-borde-fuerte)" />}
          <Tooltip
            cursor={{ fill: 'var(--color-superficie-suave)', opacity: 0.6 }}
            content={({ active, payload }) => {
              const punto = payload?.[0]?.payload as PuntoTiempo<V> | undefined;
              if (!active || !punto) return null;
              return (
                <Recuadro
                  titulo={punto.etiquetaLarga}
                  filas={series.map((s) => ({
                    valor: formatear(punto[s.clave]),
                    nombre: s.nombre,
                    color: series.length > 1 ? s.color : undefined,
                  }))}
                  notas={notas?.(punto)}
                />
              );
            }}
          />
          {series.map((s, i) => (
            <Bar
              key={s.clave}
              dataKey={String(s.clave)}
              name={s.nombre}
              fill={s.color}
              stackId={series.length > 1 ? 'periodo' : undefined}
              maxBarSize={24}
              isAnimationActive={!reducido}
              shape={formas[i]}
            >
              {s === principal && indiceMaximo >= 0 && (
                <LabelList
                  content={(props) => {
                    const { index, viewBox } = props as { index?: number; viewBox?: Rectangulo };
                    if (index !== indiceMaximo || !viewBox) return <g />;
                    const { x, y, w } = normalizar(viewBox);
                    return (
                      <text
                        x={x + w / 2}
                        y={y - 7}
                        textAnchor="middle"
                        fontSize={11}
                        fill="var(--color-tinta)"
                        className="tabular-nums"
                      >
                        {formatear(maximo)}
                      </text>
                    );
                  }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

/** Un nombre largo se corta para el eje; completo, está en el recuadro y la tabla. */
export const recortar = (texto: string, largo = 22) =>
  texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;

/**
 * Barras horizontales, una por nombre, con su cifra en la punta.
 *
 * Horizontales porque los nombres de productos son largos y así se leen sin
 * girar la cabeza. Un solo color (el de la marca): el largo ya dice cuánto, y
 * pintar cada producto de un color distinto no agrega nada. Las negativas (una
 * pérdida) van del otro lado del cero y en rojo, con su signo escrito.
 */
export function BarrasRanking({
  barras,
  formatear,
  etiqueta,
}: {
  barras: BarraRanking[];
  formatear: (valor: number) => string;
  etiqueta: string;
}) {
  const reducido = useMovimientoReducido();
  const angosto = useAngosto();
  const datos = useEstable(barras);
  const forma = useMemo(() => formaBarra('barra', (dato) => (dato as BarraRanking).valor < 0), []);
  const largo = angosto ? 13 : 22;
  const conNegativos = barras.some((b) => b.valor < 0);
  const largoNombres = Math.max(...barras.map((b) => recortar(b.nombre, largo).length), 4);
  const anchoNombres = Math.min(Math.max(largoNombres * 6.6 + 12, 56), angosto ? 96 : 160);
  // Lugar para la cifra en la punta, a la derecha y, si hay pérdidas, a la izquierda.
  const largoCifras = Math.max(...barras.map((b) => formatear(b.valor).length), 1);
  const lugarCifra = Math.min(largoCifras * 6.4 + 10, angosto ? 84 : 110);

  const colorDe = (b: BarraRanking) => (b.otros ? COLOR_OTROS : b.valor < 0 ? COLOR_PERDIDA : COLOR_MARCA);

  return (
    <div role="figure" aria-label={etiqueta}>
      <ResponsiveContainer
        width="100%"
        height={barras.length * 34 + 12}
        initialDimension={{ width: 500, height: barras.length * 34 + 12 }}
      >
        <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
          {/* El lugar de la cifra en la punta va dentro del eje (en píxeles): a la
              derecha siempre y, si hay pérdidas, también a la izquierda del cero,
              entre la barra y los nombres. */}
          <XAxis
            type="number"
            hide
            domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
            padding={{ left: conNegativos ? lugarCifra : 0, right: lugarCifra }}
          />
          <YAxis
            type="category"
            dataKey="nombre"
            width={anchoNombres}
            tickLine={false}
            axisLine={false}
            // Un <text> propio: el de Recharts parte los nombres largos en dos renglones.
            tick={(props) => {
              const { x, y, payload } = props as { x?: number | string; y?: number | string; payload?: { value?: unknown } };
              const nombre = String(payload?.value ?? '');
              return (
                <text
                  x={x}
                  y={y}
                  dx={-6}
                  textAnchor="end"
                  dominantBaseline="central"
                  {...TEXTO_EJE}
                >
                  <title>{nombre}</title>
                  {recortar(nombre, largo)}
                </text>
              );
            }}
          />
          <ReferenceLine x={0} stroke="var(--color-borde-fuerte)" />
          <Tooltip
            cursor={{ fill: 'var(--color-superficie-suave)', opacity: 0.6 }}
            content={({ active, payload }) => {
              const b = payload?.[0]?.payload as BarraRanking | undefined;
              if (!active || !b) return null;
              return <Recuadro titulo={b.nombre} filas={[{ valor: formatear(b.valor), nombre: '' }]} notas={b.detalle} />;
            }}
          />
          <Bar
            dataKey="valor"
            maxBarSize={20}
            isAnimationActive={!reducido}
            shape={forma}
          >
            {datos.map((b) => (
              <Cell key={b.nombre} fill={colorDe(b)} />
            ))}
            <LabelList
              dataKey="valor"
              content={(props) => {
                const { viewBox, value } = props as { viewBox?: Rectangulo; value?: number };
                if (!viewBox || typeof value !== 'number') return <g />;
                const { x, y, w, h } = normalizar(viewBox);
                const negativa = value < 0;
                return (
                  <text
                    x={negativa ? x - 6 : x + w + 6}
                    y={y + h / 2}
                    dominantBaseline="central"
                    textAnchor={negativa ? 'end' : 'start'}
                    fontSize={11}
                    fill="var(--color-tinta)"
                    className="tabular-nums"
                  >
                    {formatear(value)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Partes de un total (torta, mapa de árbol)                           */
/* ------------------------------------------------------------------ */

export interface Parte {
  nombre: string;
  valor: number;
  /** El color de esa parte, siempre el mismo para el mismo nombre. */
  color: string;
  /** Lo que se dice al lado del monto en la leyenda («5 ventas»). */
  detalle?: string;
}

/** Texto oscuro sobre el amarillo (el cuarto color); blanco sobre los demás. */
export const textoSobre = (color: string) => (color === COLOR_SERIE[3] ? '#0b0b0b' : '#ffffff');

/* ------------------------------------------------------------------ */
/* Lista de avance                                                     */
/* ------------------------------------------------------------------ */

export interface Avance {
  nombre: string;
  /** Lo cumplido (entregas). */
  hecho: number;
  /** Sobre cuánto (asignados). */
  total: number;
  /** La cifra que acompaña («3 de 4 · 25 min en promedio»). */
  cifra: string;
}

/**
 * Una fila por persona: su nombre, cuánto de lo suyo cumplió como una barra
 * delgada y la cifra escrita. Cada barra se mide contra lo suyo, no contra el
 * mejor: a quien le tocaron dos pedidos y entregó dos se le ve completo.
 */
export function ListaAvance({ filas, etiqueta }: { filas: Avance[]; etiqueta: string }) {
  return (
    <ul role="list" aria-label={etiqueta} className="space-y-3.5 px-2 pt-1">
      {filas.map((f) => {
        const pct = f.total > 0 ? Math.min((f.hecho / f.total) * 100, 100) : 0;
        return (
          <li key={f.nombre}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-tinta-suave">{f.nombre}</span>
              <span className="shrink-0 text-xs tabular-nums text-tinta">{f.cifra}</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full"
              style={{ background: `color-mix(in srgb, ${COLOR_MARCA} 18%, transparent)` }}
              role="meter"
              aria-label={f.nombre}
              aria-valuemin={0}
              aria-valuemax={f.total}
              aria-valuenow={f.hecho}
            >
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLOR_MARCA }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
