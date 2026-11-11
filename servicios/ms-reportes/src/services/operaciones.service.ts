import { env } from '../config/env.js';
import type {
  FiltroInventario,
  FiltroProduccion,
  ItemReporteInventarioDTO,
  LineaCorridaDTO,
  LineaMovimientoReporteDTO,
  ReporteInventarioDTO,
  ReporteProduccionDTO,
  TipoItemInventario,
} from '../dtos/reporte.dto.js';
import { ErrorApp } from '../errors/error-app.js';
import { bolivianos, dosDecimales } from '../utils/dinero.js';
import { rangoDelPeriodo } from '../utils/fechas.js';
import { fechaLegible, generarPdf, type DocumentoReporte } from './pdf.service.js';
import * as avisoService from './aviso.service.js';

/**
 * HU-30 · Reporte de producción y de movimientos de inventario.
 *
 * A diferencia de ventas y pedidos (Sprint 6), aquí ms-reportes no guarda una
 * copia: **compone** el reporte preguntando al momento por REST interno a
 * ms-catalogo (las órdenes finalizadas) y a ms-inventario (los movimientos y la
 * existencia de hoy). Los movimientos nacen por muchos caminos y el reporte se
 * consulta poco: preguntar es más simple que mantener una copia al día. Si uno
 * de los dos no responde, el reporte dice cuál (503) en vez de mostrar cifras a
 * medias (RNF-DIS-01).
 *
 * Los cálculos y el PDF son los del sistema anterior (RF-PRO-08, RF-INV-08).
 */

const redondearCantidad = (v: number) => Math.round(v * 1000) / 1000;
const formatearCantidad = (v: number) => v.toLocaleString('es-BO', { maximumFractionDigits: 3 });
const recortar = (texto: string, largo: number) => (texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto);

async function preguntar<T>(servicio: string, url: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch {
    throw new ErrorApp(503, `El reporte necesita a ${servicio}, que no responde. Intente de nuevo en unos minutos.`);
  }
  if (!r.ok) throw new ErrorApp(503, `${servicio} no pudo dar los datos del reporte (respondió ${r.status}).`);
  return (await r.json()) as T;
}

const parametros = (f: { desde: string; hasta: string }, extra: Record<string, number | undefined>) => {
  const { desde, hasta } = rangoDelPeriodo(f);
  const p = new URLSearchParams({ desde: desde.toISOString(), hasta: hasta.toISOString() });
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, String(v));
  return p.toString();
};

/* ------------------------------------------------------------------ */
/* Producción                                                          */
/* ------------------------------------------------------------------ */

interface OrdenDeCatalogo {
  idOrden: number;
  fecha: string;
  producto: string;
  receta: string;
  cantidad: number;
  cantidadObtenida: number;
  costoTotal: number | null;
  insumos: { idInsumo: number; insumo: string; unidad: string; cantidad: number; costoUnitario: number }[];
}

export async function produccion(filtro: FiltroProduccion): Promise<ReporteProduccionDTO> {
  const { producto, ordenes } = await preguntar<{ producto: string | null; ordenes: OrdenDeCatalogo[] }>(
    'ms-catalogo',
    `${env.catalogoUrl}/interno/ordenes/reporte?${parametros(filtro, { idProducto: filtro.idProducto })}`,
  );

  const porProducto = new Map<string, { corridas: number; unidades: number; costo: number }>();
  const insumos = new Map<number, { insumo: string; unidad: string; cantidad: number; costo: number }>();
  let unidades = 0;
  let merma = 0;
  let costoTotal = 0;

  const corridas: LineaCorridaDTO[] = ordenes.map((o) => {
    // Lo consumido quedó guardado al finalizar (HU-10): es el costo de entonces.
    const costoDeInsumos = dosDecimales(o.insumos.reduce((t, i) => t + i.cantidad * i.costoUnitario, 0));
    const costo = o.costoTotal ?? costoDeInsumos;
    for (const i of o.insumos) {
      const a = insumos.get(i.idInsumo) ?? { insumo: i.insumo, unidad: i.unidad, cantidad: 0, costo: 0 };
      a.cantidad = redondearCantidad(a.cantidad + i.cantidad);
      a.costo = dosDecimales(a.costo + i.cantidad * i.costoUnitario);
      insumos.set(i.idInsumo, a);
    }
    const perdida = Math.max(0, o.cantidad - o.cantidadObtenida);
    unidades += o.cantidadObtenida;
    merma += perdida;
    costoTotal = dosDecimales(costoTotal + costo);
    const p = porProducto.get(o.producto) ?? { corridas: 0, unidades: 0, costo: 0 };
    p.corridas += 1;
    p.unidades += o.cantidadObtenida;
    p.costo = dosDecimales(p.costo + costo);
    porProducto.set(o.producto, p);
    return {
      idOrden: o.idOrden,
      fecha: o.fecha,
      producto: o.producto,
      receta: o.receta,
      cantidad: o.cantidadObtenida,
      merma: perdida,
      instantanea: false,
      costo,
      costoUnitario: o.cantidadObtenida === 0 ? 0 : dosDecimales(costo / o.cantidadObtenida),
    };
  });

  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    producto: filtro.idProducto ? (producto ?? `producto ${filtro.idProducto}`) : null,
    generadoEn: new Date().toISOString(),
    resumen: {
      corridas: ordenes.length,
      unidades,
      merma,
      costoTotal,
      costoUnitarioPromedio: unidades === 0 ? 0 : dosDecimales(costoTotal / unidades),
    },
    porProducto: [...porProducto].map(([nombre, p]) => ({ producto: nombre, ...p })).sort((a, b) => b.unidades - a.unidades),
    insumosConsumidos: [...insumos.values()].sort((a, b) => b.costo - a.costo),
    corridas,
  };
}

export function documentoDeProduccion(r: ReporteProduccionDTO): DocumentoReporte {
  return {
    titulo: 'Reporte de producción',
    alcance: `${fechaLegible(r.desde)} al ${fechaLegible(r.hasta)} · ${r.producto ?? 'todos los productos'}`,
    generadoEn: r.generadoEn,
    cifras: [
      { etiqueta: 'Corridas', valor: String(r.resumen.corridas) },
      { etiqueta: 'Unidades', valor: String(r.resumen.unidades) },
      { etiqueta: 'Merma', valor: String(r.resumen.merma) },
      { etiqueta: 'Costo total', valor: bolivianos(r.resumen.costoTotal) },
      { etiqueta: 'Costo unitario', valor: bolivianos(r.resumen.costoUnitarioPromedio) },
    ],
    secciones: [
      {
        titulo: 'Por producto',
        columnas: [
          { titulo: 'Producto', proporcion: 0.44 },
          { titulo: 'Corridas', proporcion: 0.16, alinear: 'right' },
          { titulo: 'Obtenidas', proporcion: 0.16, alinear: 'right' },
          { titulo: 'Costo', proporcion: 0.24, alinear: 'right' },
        ],
        filas: r.porProducto.map((p) => [p.producto, String(p.corridas), String(p.unidades), bolivianos(p.costo)]),
        vacio: 'No se finalizó ninguna orden en el período seleccionado.',
      },
      {
        titulo: 'Insumos consumidos',
        columnas: [
          { titulo: 'Insumo', proporcion: 0.5 },
          { titulo: 'Cantidad', proporcion: 0.25, alinear: 'right' },
          { titulo: 'Costo', proporcion: 0.25, alinear: 'right' },
        ],
        filas: r.insumosConsumidos.map((i) => [i.insumo, `${formatearCantidad(i.cantidad)} ${i.unidad}`, bolivianos(i.costo)]),
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Movimientos de inventario                                           */
/* ------------------------------------------------------------------ */

interface MovimientosDeInventario {
  item: string | null;
  movimientos: (LineaMovimientoReporteDTO & { idItem: number })[];
  existencias: { tipoItem: TipoItemInventario; idItem: number; existencia: number }[];
}

export async function inventario(filtro: FiltroInventario): Promise<ReporteInventarioDTO> {
  const datos = await preguntar<MovimientosDeInventario>(
    'ms-inventario',
    `${env.inventarioUrl}/interno/movimientos/reporte?${parametros(filtro, { idIngrediente: filtro.idIngrediente, idProducto: filtro.idProducto })}`,
  );

  const porItem = new Map<string, ItemReporteInventarioDTO & { id: number }>();
  let costoIngresado = 0;
  for (const m of datos.movimientos) {
    const clave = `${m.tipoItem}:${m.idItem}`;
    const a = porItem.get(clave) ?? { tipo: m.tipoItem, id: m.idItem, item: m.item, unidad: m.unidad, entradas: 0, salidas: 0, neto: 0, existencia: 0 };
    if (m.tipo === 'Ingreso') {
      a.entradas = redondearCantidad(a.entradas + m.cantidad);
      costoIngresado = dosDecimales(costoIngresado + (m.costo ?? 0));
    } else {
      a.salidas = redondearCantidad(a.salidas + m.cantidad);
    }
    porItem.set(clave, a);
  }
  const existencia = new Map(datos.existencias.map((e) => [`${e.tipoItem}:${e.idItem}`, e.existencia]));

  const etiqueta = filtro.idIngrediente
    ? `insumo ${datos.item ?? filtro.idIngrediente}`
    : filtro.idProducto
      ? `producto ${datos.item ?? filtro.idProducto}`
      : null;

  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    filtro: etiqueta,
    generadoEn: new Date().toISOString(),
    resumen: {
      ingresos: datos.movimientos.filter((m) => m.tipo === 'Ingreso').length,
      egresos: datos.movimientos.filter((m) => m.tipo === 'Egreso').length,
      costoIngresado,
    },
    porItem: [...porItem.entries()]
      .map(([clave, { id: _id, ...i }]) => ({
        ...i,
        neto: redondearCantidad(i.entradas - i.salidas),
        existencia: existencia.get(clave) ?? 0,
      }))
      .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.item.localeCompare(b.item)),
    movimientos: datos.movimientos.map(({ idItem: _id, ...m }) => m),
  };
}

const diaLegible = (iso: string) => {
  const f = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(f.getDate())}/${dos(f.getMonth() + 1)}/${f.getFullYear()}`;
};

export function documentoDeInventario(r: ReporteInventarioDTO): DocumentoReporte {
  // Con un solo ítem, las cifras dicen cuánto entró y salió; con todos, solo cuentan
  // movimientos: no se suman kilos con litros ni con unidades.
  const unico = r.filtro !== null && r.porItem.length === 1 ? r.porItem[0] : null;
  return {
    titulo: 'Reporte de movimientos de inventario',
    alcance: `${fechaLegible(r.desde)} al ${fechaLegible(r.hasta)} · ${r.filtro ?? 'todos los ítems'}`,
    generadoEn: r.generadoEn,
    cifras: unico
      ? [
          { etiqueta: 'Entró', valor: `${formatearCantidad(unico.entradas)} ${unico.unidad}` },
          { etiqueta: 'Salió', valor: `${formatearCantidad(unico.salidas)} ${unico.unidad}` },
          { etiqueta: 'Existencia hoy', valor: `${formatearCantidad(unico.existencia)} ${unico.unidad}` },
          { etiqueta: 'Costo ingresado', valor: bolivianos(r.resumen.costoIngresado) },
        ]
      : [
          { etiqueta: 'Movimientos de entrada', valor: String(r.resumen.ingresos) },
          { etiqueta: 'Movimientos de salida', valor: String(r.resumen.egresos) },
          { etiqueta: 'Costo ingresado', valor: bolivianos(r.resumen.costoIngresado) },
        ],
    notas: ['Las salidas incluyen lo vendido en el mostrador y lo entregado a domicilio (motivo Venta).'],
    secciones: [
      {
        titulo: 'Movimiento por ítem',
        columnas: [
          { titulo: 'Ítem', proporcion: 0.3 },
          { titulo: 'Tipo', proporcion: 0.12 },
          { titulo: 'Entradas', proporcion: 0.14, alinear: 'right' },
          { titulo: 'Salidas', proporcion: 0.14, alinear: 'right' },
          { titulo: 'Neto período', proporcion: 0.15, alinear: 'right' },
          { titulo: 'Existencia hoy', proporcion: 0.15, alinear: 'right' },
        ],
        filas: r.porItem.map((i) => [
          recortar(i.item, 32),
          i.tipo,
          `${formatearCantidad(i.entradas)} ${i.unidad}`,
          `${formatearCantidad(i.salidas)} ${i.unidad}`,
          `${formatearCantidad(i.neto)} ${i.unidad}`,
          `${formatearCantidad(i.existencia)} ${i.unidad}`,
        ]),
        vacio: 'No hubo movimientos en el período seleccionado.',
      },
      {
        titulo: 'Detalle de movimientos',
        columnas: [
          { titulo: 'Fecha', proporcion: 0.11 },
          { titulo: 'Tipo', proporcion: 0.1 },
          { titulo: 'Motivo', proporcion: 0.12 },
          { titulo: 'Ítem', proporcion: 0.22 },
          { titulo: 'Cantidad', proporcion: 0.12, alinear: 'right' },
          { titulo: 'Costo', proporcion: 0.11, alinear: 'right' },
          { titulo: 'Referencia', proporcion: 0.22 },
        ],
        filas: r.movimientos.map((m) => [
          diaLegible(m.fecha),
          m.tipo,
          m.motivo,
          recortar(m.item, 24),
          `${formatearCantidad(m.cantidad)} ${m.unidad}`,
          m.costo === null ? '—' : bolivianos(m.costo),
          recortar(m.referencia ?? '—', 26),
        ]),
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* PDF y correo                                                        */
/* ------------------------------------------------------------------ */

export type NombreOperacion = 'produccion' | 'inventario';

async function documento(nombre: NombreOperacion, filtro: FiltroProduccion | FiltroInventario): Promise<DocumentoReporte> {
  return nombre === 'produccion'
    ? documentoDeProduccion(await produccion(filtro as FiltroProduccion))
    : documentoDeInventario(await inventario(filtro as FiltroInventario));
}

export async function pdf(nombre: NombreOperacion, filtro: FiltroProduccion | FiltroInventario): Promise<{ pdf: Buffer; archivo: string }> {
  return { pdf: await generarPdf(await documento(nombre, filtro)), archivo: `${nombre}-${filtro.desde}-a-${filtro.hasta}.pdf` };
}

export async function enviar(nombre: NombreOperacion, filtro: FiltroProduccion | FiltroInventario, para: string[]) {
  const doc = await documento(nombre, filtro);
  const resultado = await avisoService.reporte({
    para,
    titulo: doc.titulo,
    descripcion: `${doc.titulo} del ${filtro.desde} al ${filtro.hasta}: ${doc.cifras.map((c) => `${c.etiqueta.toLowerCase()} ${c.valor}`).join(', ')}.`,
    adjunto: { nombre: `${nombre}-${filtro.desde}-a-${filtro.hasta}.pdf`, contenido: await generarPdf(doc), tipo: 'application/pdf' },
  });
  return { ...resultado, para };
}
