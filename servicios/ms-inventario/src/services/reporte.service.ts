import { prisma } from '../config/prisma.js';

/**
 * HU-30 · Los movimientos de inventario de un período, para el reporte que
 * arma ms-reportes (composición por API: ms-reportes pregunta al momento por
 * REST interno, `GET /interno/movimientos/reporte`).
 *
 * Los movimientos nacen por muchos caminos —compras, ajustes, producción,
 * ventas, entregas, devoluciones—; en vez de publicar un evento desde cada uno,
 * ms-inventario responde la consulta con lo que tiene. «Cuenta como salida lo
 * vendido»: las ventas de mostrador y los pedidos entregados ya dejan su nota de
 * egreso con motivo Venta (Sprint 5).
 *
 * La consulta es la del sistema anterior (reporte.model.ts), adaptada al
 * esquema de este servicio.
 */

export interface FiltroMovimientos {
  desde: Date;
  hasta: Date;
  idIngrediente?: number;
  idProducto?: number;
}

export interface LineaMovimiento {
  fecha: string;
  tipo: 'Ingreso' | 'Egreso';
  motivo: string;
  tipoItem: 'Insumo' | 'Producto';
  idItem: number;
  item: string;
  unidad: string;
  cantidad: number;
  /** Lo que costó lo que entró. Nulo en los egresos: una salida no guarda costo propio. */
  costo: number | null;
  /** El proveedor y su documento, o la observación de la salida (la orden, la venta). */
  referencia: string | null;
}

const SOLO_INSUMO = { select: { id_ingrediente: true, nombre: true, unidad_medida: { select: { abreviatura: true } } } } as const;
const SOLO_PRODUCTO = { select: { producto: { select: { id_producto: true, nombre: true } } } } as const;

/** Con un ítem elegido, solo las líneas de ese ítem; sin él, todas. */
const insumos = (f: FiltroMovimientos) => (f.idProducto ? { id_ingrediente: -1 } : f.idIngrediente ? { id_ingrediente: f.idIngrediente } : {});
const productos = (f: FiltroMovimientos) => (f.idIngrediente ? { id_producto: -1 } : f.idProducto ? { id_producto: f.idProducto } : {});

const dosDecimales = (v: number) => Math.round(v * 100) / 100;

export async function movimientosDelPeriodo(f: FiltroMovimientos) {
  const rango = { fecha: { gte: f.desde, lte: f.hasta } };
  const [ingresos, egresos] = await Promise.all([
    prisma.nota_ingreso.findMany({
      where: rango,
      orderBy: { fecha: 'asc' },
      select: {
        fecha: true,
        motivo: true,
        proveedor: true,
        numero_documento: true,
        detalle_ingreso_insumo: {
          where: insumos(f),
          select: { cantidad: true, costo_unitario: true, ingrediente_almacen: { select: { ingrediente: SOLO_INSUMO } } },
        },
        detalle_ingreso_producto: { where: productos(f), select: { cantidad: true, costo_unitario: true, producto_almacen: SOLO_PRODUCTO } },
      },
    }),
    prisma.nota_egreso.findMany({
      where: rango,
      orderBy: { fecha: 'asc' },
      select: {
        fecha: true,
        motivo: true,
        observacion: true,
        detalle_egreso_insumo: { where: insumos(f), select: { cantidad: true, ingrediente_almacen: { select: { ingrediente: SOLO_INSUMO } } } },
        detalle_egreso_producto: { where: productos(f), select: { cantidad: true, producto_almacen: SOLO_PRODUCTO } },
      },
    }),
  ]);

  const movimientos: LineaMovimiento[] = [];
  for (const n of ingresos) {
    const referencia = [n.proveedor, n.numero_documento].filter(Boolean).join(' · ') || null;
    const base = { fecha: n.fecha.toISOString(), tipo: 'Ingreso' as const, motivo: n.motivo, referencia };
    for (const d of n.detalle_ingreso_insumo) {
      const i = d.ingrediente_almacen.ingrediente;
      const cantidad = Number(d.cantidad);
      movimientos.push({ ...base, tipoItem: 'Insumo', idItem: i.id_ingrediente, item: i.nombre, unidad: i.unidad_medida.abreviatura, cantidad, costo: dosDecimales(cantidad * Number(d.costo_unitario)) });
    }
    for (const d of n.detalle_ingreso_producto) {
      const p = d.producto_almacen.producto;
      movimientos.push({ ...base, tipoItem: 'Producto', idItem: p.id_producto, item: p.nombre, unidad: 'u', cantidad: d.cantidad, costo: dosDecimales(d.cantidad * Number(d.costo_unitario)) });
    }
  }
  for (const n of egresos) {
    const base = { fecha: n.fecha.toISOString(), tipo: 'Egreso' as const, motivo: n.motivo, referencia: n.observacion ?? null };
    for (const d of n.detalle_egreso_insumo) {
      const i = d.ingrediente_almacen.ingrediente;
      movimientos.push({ ...base, tipoItem: 'Insumo', idItem: i.id_ingrediente, item: i.nombre, unidad: i.unidad_medida.abreviatura, cantidad: Number(d.cantidad), costo: null });
    }
    for (const d of n.detalle_egreso_producto) {
      const p = d.producto_almacen.producto;
      movimientos.push({ ...base, tipoItem: 'Producto', idItem: p.id_producto, item: p.nombre, unidad: 'u', cantidad: d.cantidad, costo: null });
    }
  }
  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Lo que hay hoy de cada ítem que se movió, para leer el neto con contexto.
  const idsInsumo = [...new Set(movimientos.filter((m) => m.tipoItem === 'Insumo').map((m) => m.idItem))];
  const idsProducto = [...new Set(movimientos.filter((m) => m.tipoItem === 'Producto').map((m) => m.idItem))];
  const [stockInsumos, stockProductos] = await Promise.all([
    prisma.ingrediente_almacen.groupBy({ by: ['id_ingrediente'], where: { id_ingrediente: { in: idsInsumo } }, _sum: { stock_actual: true } }),
    prisma.producto_almacen.groupBy({ by: ['id_producto'], where: { id_producto: { in: idsProducto } }, _sum: { stock_actual: true } }),
  ]);
  const existencias = [
    ...stockInsumos.map((s) => ({ tipoItem: 'Insumo' as const, idItem: s.id_ingrediente, existencia: Number(s._sum.stock_actual ?? 0) })),
    ...stockProductos.map((s) => ({ tipoItem: 'Producto' as const, idItem: s.id_producto, existencia: Number(s._sum.stock_actual ?? 0) })),
  ];

  return { movimientos, existencias };
}

/** El nombre de un ítem, para el título del reporte aunque no se haya movido. */
export async function nombreDeItem(f: { idIngrediente?: number; idProducto?: number }): Promise<string | null> {
  if (f.idIngrediente) return (await prisma.ingrediente.findUnique({ where: { id_ingrediente: f.idIngrediente }, select: { nombre: true } }))?.nombre ?? null;
  if (f.idProducto) return (await prisma.producto.findUnique({ where: { id_producto: f.idProducto }, select: { nombre: true } }))?.nombre ?? null;
  return null;
}
