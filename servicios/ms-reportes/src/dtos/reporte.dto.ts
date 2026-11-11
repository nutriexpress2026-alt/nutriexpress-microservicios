import { z } from 'zod';

/**
 * Sprint 6 · Reportes de ventas (HU-28) y de pedidos (HU-29), y las «fotos» con
 * que ms-ventas y ms-pedidos le cuentan a ms-reportes cómo quedó cada venta y
 * cada pedido. Los nombres y las formas de los reportes son los del sistema
 * anterior: el frontend reutilizado los muestra sin cambios.
 */

/* ------------------------------------------------------------------ */
/* Las fotos (eventos VentaRegistrada y PedidoEstadoCambiado)           */
/* ------------------------------------------------------------------ */

const lineaFoto = z.object({
  idProducto: z.number().int(),
  nombre: z.string(),
  cantidad: z.number().int(),
  precioUnitario: z.number(),
  costoUnitario: z.number().nullable().optional().default(null),
});

export const esquemaFotoVenta = z.object({
  idVenta: z.number().int(),
  fecha: z.iso.datetime(),
  estado: z.enum(['Pendiente', 'Pagado', 'Anulado']),
  tipoVenta: z.string(),
  metodoPago: z.string(),
  total: z.number(),
  cliente: z.object({ id: z.number().int(), nombre: z.string() }).nullable().optional().default(null),
  vendedor: z.object({ id: z.number().int(), nombre: z.string() }),
  items: z.array(lineaFoto),
  actualizadoEn: z.iso.datetime(),
});

export const esquemaFotoPedido = z.object({
  idPedido: z.number().int(),
  idUsuario: z.number().int(),
  cliente: z.string(),
  fechaPedido: z.iso.datetime(),
  estado: z.string(),
  estadoPago: z.string(),
  motivo: z.string().nullable().optional().default(null),
  metodoPago: z.string(),
  total: z.number(),
  referenciaPago: z.string().nullable().optional().default(null),
  repartidor: z.object({ id: z.number().int(), nombre: z.string() }).nullable(),
  fechaEntrega: z.iso.datetime().nullable(),
  direccion: z.string().optional().default(''),
  items: z.array(lineaFoto),
  actualizadoEn: z.iso.datetime(),
});

export type FotoVenta = z.infer<typeof esquemaFotoVenta>;
export type FotoPedido = z.infer<typeof esquemaFotoPedido>;

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */

const MAXIMO_DIAS = 366;
const rango = { desde: z.iso.date(), hasta: z.iso.date() } as const;
const rangoOrdenado = (f: { desde: string; hasta: string }) => new Date(f.desde) <= new Date(f.hasta);
const rangoAcotado = (f: { desde: string; hasta: string }) =>
  (new Date(f.hasta).getTime() - new Date(f.desde).getTime()) / 86_400_000 <= MAXIMO_DIAS;
const MENSAJE_ORDEN = { message: 'La fecha inicial no puede ser posterior a la final', path: ['desde'] };
const MENSAJE_TOPE = { message: `El rango no puede superar ${MAXIMO_DIAS} días`, path: ['hasta'] };
const id = z.coerce.number().int().positive().optional();

/** HU-28 · «Por fechas, producto y vendedor». */
export const esquemaReporteVentas = z
  .object({ ...rango, idProducto: id, idVendedor: id })
  .refine(rangoOrdenado, MENSAJE_ORDEN)
  .refine(rangoAcotado, MENSAJE_TOPE);

export const ESTADOS_PEDIDO = ['Pendiente de pago', 'Recibido', 'En preparacion', 'En camino', 'Entregado', 'Cancelado'] as const;

/** HU-29 · «Por fechas, estado y repartidor». */
export const esquemaReportePedidos = z
  .object({ ...rango, estado: z.enum(ESTADOS_PEDIDO).optional(), idRepartidor: id, idProducto: id })
  .refine(rangoOrdenado, MENSAJE_ORDEN)
  .refine(rangoAcotado, MENSAJE_TOPE);

/** Un tope: el reporte lleva un PDF y la cuota de envío es limitada. */
const TOPE_DESTINATARIOS = 5;

/** «Enviable a varios correos»: separados por coma o en una lista. */
export const destinatariosDeReporte = z
  .union([z.string(), z.array(z.string())])
  .transform((valor) =>
    (Array.isArray(valor) ? valor : valor.split(','))
      .map((c) => c.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.email('indique correos válidos'))
      .min(1, 'indique al menos un destinatario')
      .max(TOPE_DESTINATARIOS, `No se puede enviar a más de ${TOPE_DESTINATARIOS} correos`),
  );

export const esquemaDestinatarios = z.looseObject({ para: destinatariosDeReporte });

export type FiltroVentas = z.infer<typeof esquemaReporteVentas>;
export type FiltroPedidos = z.infer<typeof esquemaReportePedidos>;

/* ------------------------------------------------------------------ */
/* Lo que devuelven                                                    */
/* ------------------------------------------------------------------ */

export interface GananciaDTO {
  /** Lo que costó lo vendido: cantidad por el costo al salir del almacén. */
  costo: number | null;
  /** Lo cobrado menos ese costo (ganancia bruta). */
  ganancia: number | null;
  /** La ganancia como porcentaje de lo cobrado. */
  margen: number | null;
  /** Unidades vendidas sin costo registrado: no entran en la ganancia. */
  unidadesSinCosto: number;
}

export interface LineaProductoReporteDTO extends GananciaDTO {
  idProducto: number;
  nombre: string;
  unidades: number;
  importe: number;
  /** Porcentaje del importe total. Es lo que responde «qué se vende». */
  participacion: number;
}

export interface ResumenReporteDTO extends GananciaDTO {
  cantidadVentas: number;
  unidades: number;
  total: number;
  ticketPromedio: number;
}

export interface ReporteVentasDTO {
  desde: string;
  hasta: string;
  producto: string | null;
  vendedor: string | null;
  generadoEn: string;
  resumen: ResumenReporteDTO;
  porProducto: LineaProductoReporteDTO[];
  porMetodoPago: { metodo: string; cantidadVentas: number; total: number }[];
  porVendedor: { idVendedor: number; vendedor: string; cantidadVentas: number; total: number }[];
  porDia: { dia: string; cantidadVentas: number; total: number }[];
  /** Cuántas se anularon en el período: no suman, pero se cuentan aparte. */
  anuladas: { cantidad: number; total: number };
}

export interface LineaPedidoReporteDTO {
  id: number;
  fecha: string;
  estado: string;
  metodoPago: string;
  total: number;
  repartidor: string | null;
  /** Minutos entre el pedido y la entrega. Nulo si aún no se entregó. */
  minutosDeEntrega: number | null;
}

export interface ReportePedidosDTO {
  desde: string;
  hasta: string;
  estado: string | null;
  repartidor: string | null;
  producto: string | null;
  generadoEn: string;
  resumen: GananciaDTO & {
    cantidadPedidos: number;
    unidades: number;
    entregados: number;
    cancelados: number;
    /** Lo que suman los pedidos **no cancelados**: un cancelado no dejó dinero. */
    total: number;
    minutosPromedio: number | null;
  };
  porEstado: { estado: string; cantidad: number; total: number }[];
  porProducto: LineaProductoReporteDTO[];
  porRepartidor: {
    repartidor: string;
    /** Todos los que tuvo asignados, se hayan entregado o no. */
    asignados: number;
    /** Solo los que llegó a entregar. */
    entregas: number;
    minutosPromedio: number | null;
  }[];
  pedidos: LineaPedidoReporteDTO[];
}

/** El comprobante del pedido (el mismo tique del sistema anterior), para el correo. */
export interface ComprobantePedidoDTO {
  numero: string;
  fecha: string;
  pagadoEn: string | null;
  cliente: string;
  entrega: string;
  metodoPago: string;
  referenciaPago: string | null;
  detalle: { nombre: string; cantidad: number; precioUnitario: number; subtotal: number }[];
  cantidadItems: number;
  total: number;
  soporte: string;
}
