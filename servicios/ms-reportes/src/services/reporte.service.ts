import type {
  FiltroPedidos,
  FiltroVentas,
  GananciaDTO,
  LineaPedidoReporteDTO,
  LineaProductoReporteDTO,
  ReportePedidosDTO,
  ReporteVentasDTO,
} from '../dtos/reporte.dto.js';
import * as proyeccion from '../models/proyeccion.model.js';
import { bolivianos, dosDecimales, formatearPorcentaje } from '../utils/dinero.js';
import { diaLocal, rangoDelPeriodo } from '../utils/fechas.js';
import { cerrarGanancia, gananciaVacia, notaDeGanancia, sumarLinea, type AcumuladoGanancia } from './ganancia.js';
import { fechaLegible, generarPdf, type ColumnaReporte, type DocumentoReporte } from './pdf.service.js';
import * as avisoService from './aviso.service.js';

/**
 * HU-28 y HU-29 · Reportes de ventas y de pedidos.
 *
 * Los cálculos son los del sistema anterior (RF-VEN-07, RF-PED-10); lo que
 * cambia es de dónde salen los datos: no de las tablas de otros servicios, sino
 * de la copia que ms-reportes arma con sus eventos (RNF-ARQ-02).
 */

type LineaVendida = { idProducto: number; nombre: string; cantidad: number; precioUnitario: number; costoUnitario: number | null };

/** Suma las líneas por producto, con su ganancia. Igual en ventas y en pedidos. */
class PorProducto {
  private mapa = new Map<number, { nombre: string; unidades: number; importe: number; ganancia: AcumuladoGanancia }>();

  sumar(l: LineaVendida, ganancia: AcumuladoGanancia): number {
    const importe = dosDecimales(l.cantidad * l.precioUnitario);
    const vendida = { cantidad: l.cantidad, importe, costoUnitario: l.costoUnitario };
    sumarLinea(ganancia, vendida);
    const a = this.mapa.get(l.idProducto) ?? { nombre: l.nombre, unidades: 0, importe: 0, ganancia: gananciaVacia() };
    a.unidades += l.cantidad;
    a.importe = dosDecimales(a.importe + importe);
    sumarLinea(a.ganancia, vendida);
    this.mapa.set(l.idProducto, a);
    return importe;
  }

  lineas(total: number): LineaProductoReporteDTO[] {
    return [...this.mapa]
      .map(([idProducto, p]) => ({
        idProducto,
        nombre: p.nombre,
        unidades: p.unidades,
        importe: p.importe,
        participacion: total === 0 ? 0 : dosDecimales((p.importe / total) * 100),
        ...cerrarGanancia(p.ganancia),
      }))
      .sort((a, b) => b.importe - a.importe);
  }
}

/**
 * El nombre para el título del reporte. Un producto que todavía no se vendió no
 * es un error: el reporte sale vacío, con el número en vez del nombre.
 */
async function nombreDe(buscar: () => Promise<string | null>, respaldo: string): Promise<string> {
  return (await buscar()) ?? respaldo;
}

const promedio = (valores: number[]): number | null =>
  valores.length === 0 ? null : Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);

/* ------------------------------------------------------------------ */
/* HU-28 · Ventas                                                      */
/* ------------------------------------------------------------------ */

export async function ventas(filtro: FiltroVentas): Promise<ReporteVentasDTO> {
  const producto = filtro.idProducto ? await nombreDe(() => proyeccion.nombreDeProducto(filtro.idProducto!), `producto ${filtro.idProducto}`) : null;
  const vendedor = filtro.idVendedor ? await nombreDe(() => proyeccion.nombreDeVendedor(filtro.idVendedor!), `vendedor ${filtro.idVendedor}`) : null;

  const delPeriodo = await proyeccion.ventasDelPeriodo({ ...rangoDelPeriodo(filtro), idProducto: filtro.idProducto, idVendedor: filtro.idVendedor });
  // «Las ventas anuladas no suman»: se cuentan aparte. Una con QR sin acreditar todavía no es dinero.
  const anuladas = delPeriodo.filter((v) => v.estado === 'Anulado');
  const cobradas = delPeriodo.filter((v) => v.estado === 'Pagado');

  const porProducto = new PorProducto();
  const porMetodo = new Map<string, { cantidadVentas: number; total: number }>();
  const porVendedor = new Map<number, { vendedor: string; cantidadVentas: number; total: number }>();
  const porDia = new Map<string, { cantidadVentas: number; total: number }>();
  const ganancia = gananciaVacia();
  let unidades = 0;
  let total = 0;

  for (const v of cobradas) {
    // Con un producto elegido, cuenta lo de ese producto y no la venta entera.
    const lineas = filtro.idProducto ? v.items.filter((l) => l.idProducto === filtro.idProducto) : v.items;
    let importeDeEstaVenta = 0;
    for (const l of lineas) {
      importeDeEstaVenta += porProducto.sumar(l as LineaVendida, ganancia);
      unidades += l.cantidad;
    }
    importeDeEstaVenta = dosDecimales(importeDeEstaVenta);
    total = dosDecimales(total + importeDeEstaVenta);

    const sumar = <K>(mapa: Map<K, { cantidadVentas: number; total: number }>, clave: K, base: object = {}) => {
      const a = mapa.get(clave) ?? { ...base, cantidadVentas: 0, total: 0 };
      a.cantidadVentas += 1;
      a.total = dosDecimales(a.total + importeDeEstaVenta);
      mapa.set(clave, a);
    };
    sumar(porMetodo, v.metodoPago);
    sumar(porVendedor as Map<number, { cantidadVentas: number; total: number }>, v.vendedor.id, { vendedor: v.vendedor.nombre });
    sumar(porDia, diaLocal(v.fecha));
  }

  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    producto,
    vendedor,
    generadoEn: new Date().toISOString(),
    resumen: {
      cantidadVentas: cobradas.length,
      unidades,
      total,
      ticketPromedio: cobradas.length === 0 ? 0 : dosDecimales(total / cobradas.length),
      ...cerrarGanancia(ganancia),
    },
    porProducto: porProducto.lineas(total),
    porMetodoPago: [...porMetodo].map(([metodo, m]) => ({ metodo, ...m })).sort((a, b) => b.total - a.total),
    porVendedor: [...porVendedor].map(([idVendedor, v]) => ({ idVendedor, ...v })).sort((a, b) => b.total - a.total),
    porDia: [...porDia].map(([dia, d]) => ({ dia, ...d })).sort((a, b) => a.dia.localeCompare(b.dia)),
    anuladas: { cantidad: anuladas.length, total: dosDecimales(anuladas.reduce((t, v) => t + v.total, 0)) },
  };
}

/* ------------------------------------------------------------------ */
/* HU-29 · Pedidos                                                     */
/* ------------------------------------------------------------------ */

export async function pedidos(filtro: FiltroPedidos): Promise<ReportePedidosDTO> {
  const producto = filtro.idProducto ? await nombreDe(() => proyeccion.nombreDeProducto(filtro.idProducto!), `producto ${filtro.idProducto}`) : null;
  const repartidor = filtro.idRepartidor ? await nombreDe(() => proyeccion.nombreDeRepartidor(filtro.idRepartidor!), `repartidor ${filtro.idRepartidor}`) : null;

  const encontrados = await proyeccion.pedidosDelPeriodo({
    ...rangoDelPeriodo(filtro),
    estado: filtro.estado,
    idRepartidor: filtro.idRepartidor,
    idProducto: filtro.idProducto,
  });

  const ganancia = gananciaVacia();
  const porProducto = new PorProducto();
  const porEstado = new Map<string, { cantidad: number; total: number }>();
  const porRepartidor = new Map<string, { asignados: number; entregas: number; minutos: number[] }>();
  const minutosEntregados: number[] = [];
  let unidades = 0;
  let total = 0;

  const lineas: LineaPedidoReporteDTO[] = encontrados.map((p) => {
    const vendido = filtro.idProducto ? p.items.filter((d) => d.idProducto === filtro.idProducto) : p.items;
    const importe = filtro.idProducto
      ? dosDecimales(vendido.reduce((s, d) => s + d.cantidad * d.precioUnitario, 0))
      : p.total;

    // «Los cancelados no suman al total»: figuran en su estado, no en el dinero.
    if (p.estado !== 'Cancelado') {
      total = dosDecimales(total + importe);
      for (const d of vendido) {
        porProducto.sumar(d as LineaVendida, ganancia);
        unidades += d.cantidad;
      }
    }

    const minutos = p.fechaEntrega ? Math.round((p.fechaEntrega.getTime() - p.fechaPedido.getTime()) / 60_000) : null;
    if (minutos !== null) minutosEntregados.push(minutos);

    const e = porEstado.get(p.estado) ?? { cantidad: 0, total: 0 };
    e.cantidad += 1;
    e.total = dosDecimales(e.total + importe);
    porEstado.set(p.estado, e);

    // «Distingue asignados de entregados»: entregas son solo las que llegaron.
    const nombre = p.repartidor?.nombre ?? null;
    if (nombre) {
      const r = porRepartidor.get(nombre) ?? { asignados: 0, entregas: 0, minutos: [] };
      r.asignados += 1;
      if (p.estado === 'Entregado') r.entregas += 1;
      if (minutos !== null) r.minutos.push(minutos);
      porRepartidor.set(nombre, r);
    }

    return {
      id: p._id,
      fecha: p.fechaPedido.toISOString(),
      estado: p.estado,
      metodoPago: p.metodoPago,
      total: importe,
      repartidor: nombre,
      minutosDeEntrega: minutos,
    };
  });

  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    estado: filtro.estado ?? null,
    repartidor,
    producto,
    generadoEn: new Date().toISOString(),
    resumen: {
      cantidadPedidos: encontrados.length,
      unidades,
      entregados: porEstado.get('Entregado')?.cantidad ?? 0,
      cancelados: porEstado.get('Cancelado')?.cantidad ?? 0,
      total,
      minutosPromedio: promedio(minutosEntregados),
      ...cerrarGanancia(ganancia),
    },
    porEstado: [...porEstado].map(([estado, e]) => ({ estado, ...e })),
    porProducto: porProducto.lineas(total),
    porRepartidor: [...porRepartidor]
      .map(([nombre, r]) => ({ repartidor: nombre, asignados: r.asignados, entregas: r.entregas, minutosPromedio: promedio(r.minutos) }))
      .sort((a, b) => b.entregas - a.entregas),
    pedidos: lineas,
  };
}

/* ------------------------------------------------------------------ */
/* PDF y correo                                                        */
/* ------------------------------------------------------------------ */

const importeOSinCosto = (valor: number | null) => (valor === null ? 'sin costo' : bolivianos(valor));

const cifrasDeGanancia = (g: GananciaDTO) => [
  { etiqueta: 'Costo de lo vendido', valor: importeOSinCosto(g.costo) },
  { etiqueta: 'Ganancia', valor: importeOSinCosto(g.ganancia) },
  { etiqueta: 'Margen', valor: g.margen === null ? 'sin costo' : formatearPorcentaje(g.margen) },
];

const COLUMNAS_POR_PRODUCTO: ColumnaReporte[] = [
  { titulo: 'Producto', proporcion: 0.25 },
  { titulo: 'Unidades', proporcion: 0.1, alinear: 'right' },
  { titulo: 'Importe', proporcion: 0.14, alinear: 'right' },
  { titulo: '% del total', proporcion: 0.11, alinear: 'right' },
  { titulo: 'Costo', proporcion: 0.14, alinear: 'right' },
  { titulo: 'Ganancia', proporcion: 0.14, alinear: 'right' },
  { titulo: 'Margen', proporcion: 0.12, alinear: 'right' },
];

const filaDeProducto = (p: LineaProductoReporteDTO) => [
  p.nombre,
  String(p.unidades),
  bolivianos(p.importe),
  formatearPorcentaje(p.participacion),
  p.costo === null ? '—' : bolivianos(p.costo),
  p.ganancia === null ? '—' : bolivianos(p.ganancia),
  p.margen === null ? '—' : formatearPorcentaje(p.margen),
];

export function documentoDeVentas(r: ReporteVentasDTO): DocumentoReporte {
  const filtros = [r.producto, r.vendedor ? `vendedor ${r.vendedor}` : null].filter(Boolean);
  return {
    titulo: 'Reporte de ventas',
    alcance: `${fechaLegible(r.desde)} al ${fechaLegible(r.hasta)} · ${filtros.length ? filtros.join(' · ') : 'todos los productos'}`,
    generadoEn: r.generadoEn,
    cifras: [
      { etiqueta: 'Ventas', valor: String(r.resumen.cantidadVentas) },
      { etiqueta: 'Unidades', valor: String(r.resumen.unidades) },
      { etiqueta: 'Total', valor: bolivianos(r.resumen.total) },
      { etiqueta: 'Ticket promedio', valor: bolivianos(r.resumen.ticketPromedio) },
      ...cifrasDeGanancia(r.resumen),
    ],
    notas: [
      ...notaDeGanancia(r.resumen),
      r.anuladas.cantidad > 0
        ? `${r.anuladas.cantidad} venta(s) anulada(s) por ${bolivianos(r.anuladas.total)} no suman en el total.`
        : 'No hubo ventas anuladas en el período.',
    ],
    secciones: [
      { titulo: 'Por producto', columnas: COLUMNAS_POR_PRODUCTO, filas: r.porProducto.map(filaDeProducto), vacio: 'No hubo ventas en el período seleccionado.' },
      {
        titulo: 'Por vendedor',
        columnas: [
          { titulo: 'Vendedor', proporcion: 0.5 },
          { titulo: 'Ventas', proporcion: 0.2, alinear: 'right' },
          { titulo: 'Total', proporcion: 0.3, alinear: 'right' },
        ],
        filas: r.porVendedor.map((v) => [v.vendedor, String(v.cantidadVentas), bolivianos(v.total)]),
      },
      {
        titulo: 'Por método de pago',
        columnas: [
          { titulo: 'Método', proporcion: 0.5 },
          { titulo: 'Ventas', proporcion: 0.2, alinear: 'right' },
          { titulo: 'Total', proporcion: 0.3, alinear: 'right' },
        ],
        filas: r.porMetodoPago.map((m) => [m.metodo, String(m.cantidadVentas), bolivianos(m.total)]),
      },
    ],
  };
}

export function documentoDePedidos(r: ReportePedidosDTO): DocumentoReporte {
  const filtros = [r.producto, r.estado ? `estado ${r.estado}` : null, r.repartidor ? `repartidor ${r.repartidor}` : null].filter(Boolean);
  return {
    titulo: 'Reporte de pedidos',
    alcance: `${fechaLegible(r.desde)} al ${fechaLegible(r.hasta)}${filtros.length ? ` · ${filtros.join(' · ')}` : ' · todos'}`,
    generadoEn: r.generadoEn,
    cifras: [
      { etiqueta: 'Pedidos', valor: String(r.resumen.cantidadPedidos) },
      { etiqueta: 'Entregados', valor: String(r.resumen.entregados) },
      { etiqueta: 'Total sin cancelados', valor: bolivianos(r.resumen.total) },
      { etiqueta: 'Entrega promedio', valor: r.resumen.minutosPromedio === null ? 'sin datos' : `${r.resumen.minutosPromedio} min` },
      ...cifrasDeGanancia(r.resumen),
    ],
    notas: [...notaDeGanancia(r.resumen), 'El total y la ganancia no cuentan los pedidos cancelados: no dejaron dinero.'],
    secciones: [
      { titulo: 'Por producto', columnas: COLUMNAS_POR_PRODUCTO, filas: r.porProducto.map(filaDeProducto), vacio: 'No se vendió nada en pedidos no cancelados.' },
      {
        titulo: 'Por estado',
        columnas: [
          { titulo: 'Estado', proporcion: 0.5 },
          { titulo: 'Pedidos', proporcion: 0.2, alinear: 'right' },
          { titulo: 'Total', proporcion: 0.3, alinear: 'right' },
        ],
        filas: r.porEstado.map((e) => [e.estado, String(e.cantidad), bolivianos(e.total)]),
        vacio: 'No hubo pedidos en el período seleccionado.',
      },
      {
        titulo: 'Por repartidor',
        columnas: [
          { titulo: 'Repartidor', proporcion: 0.4 },
          { titulo: 'Asignados', proporcion: 0.18, alinear: 'right' },
          { titulo: 'Entregados', proporcion: 0.18, alinear: 'right' },
          { titulo: 'Promedio', proporcion: 0.24, alinear: 'right' },
        ],
        filas: r.porRepartidor.map((x) => [x.repartidor, String(x.asignados), String(x.entregas), x.minutosPromedio === null ? 'sin datos' : `${x.minutosPromedio} min`]),
        vacio: 'Ningún pedido tuvo repartidor asignado.',
      },
    ],
  };
}

export type NombreReporte = 'ventas' | 'pedidos';

export async function pdf(nombre: NombreReporte, filtro: FiltroVentas | FiltroPedidos): Promise<{ pdf: Buffer; archivo: string }> {
  const documento = nombre === 'ventas' ? documentoDeVentas(await ventas(filtro as FiltroVentas)) : documentoDePedidos(await pedidos(filtro as FiltroPedidos));
  return { pdf: await generarPdf(documento), archivo: `${nombre}-${filtro.desde}-a-${filtro.hasta}.pdf` };
}

/** «El PDF llega a todos los correos indicados» (HU-28) y «enviable por correo» (HU-29). */
export async function enviar(nombre: NombreReporte, filtro: FiltroVentas | FiltroPedidos, para: string[]): Promise<{ enviado: boolean; motivo?: string; para: string[] }> {
  let descripcion: string;
  let documento: DocumentoReporte;
  if (nombre === 'ventas') {
    const r = await ventas(filtro as FiltroVentas);
    documento = documentoDeVentas(r);
    descripcion =
      `Reporte de ventas del ${r.desde} al ${r.hasta}${r.producto ? ` (${r.producto})` : ''}${r.vendedor ? ` de ${r.vendedor}` : ''}. ` +
      `${r.resumen.cantidadVentas} venta(s) por un total de ${bolivianos(r.resumen.total)}` +
      (r.resumen.ganancia === null ? '.' : `, con una ganancia de ${bolivianos(r.resumen.ganancia)}.`);
  } else {
    const r = await pedidos(filtro as FiltroPedidos);
    documento = documentoDePedidos(r);
    descripcion =
      `Reporte de pedidos del ${r.desde} al ${r.hasta}. ` +
      `${r.resumen.cantidadPedidos} pedido(s), ${r.resumen.entregados} entregado(s), por ${bolivianos(r.resumen.total)} sin contar los cancelados.`;
  }
  const resultado = await avisoService.reporte({
    para,
    titulo: documento.titulo,
    descripcion,
    adjunto: { nombre: `${nombre}-${filtro.desde}-a-${filtro.hasta}.pdf`, contenido: await generarPdf(documento), tipo: 'application/pdf' },
  });
  return { ...resultado, para };
}
