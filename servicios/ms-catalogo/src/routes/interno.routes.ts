import { Router } from 'express';
import * as productoModel from '../models/producto.model.js';
import * as insumoModel from '../models/insumo.model.js';
import { soloRedInterna } from '../middlewares/auth.middleware.js';
import { prisma } from '../config/prisma.js';

/**
 * Rutas internas: solo para otros microservicios dentro de la red de Docker.
 * Se montan fuera de /api, así que el API Gateway no las expone.
 */
const router = Router();
router.use(soloRedInterna);

/** Todos los productos, para que ms-inventario reconstruya su réplica al arrancar. */
router.get('/productos', async (_req, res) => {
  const productos = await productoModel.paraReplica();
  res.json(
    productos.map((p) => ({
      id: p.id_producto,
      nombre: p.nombre,
      tipoConservacion: p.tipo_conservacion,
      activo: p.activo,
    })),
  );
});

/**
 * HU-21 · El precio vigente de los productos de un pedido (?ids=1,2,3). ms-pedidos
 * lo pide al confirmar: el precio lo fija el servidor, nunca el navegador
 * (RNF-SEG-03), y el dueño del precio es el catálogo (RNF-ARQ-02).
 */
router.get('/productos/precios', async (req, res) => {
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const productos = ids.length === 0 ? [] : await productoModel.preciosDe(ids);
  res.json(
    productos.map((p) => ({ id: p.id_producto, nombre: p.nombre, precioVenta: Number(p.precio_venta), activo: p.activo })),
  );
});

/**
 * HU-09 · Cuántas recetas usan un insumo. ms-inventario lo pregunta antes de
 * eliminarlo (CU-INV-01: un insumo que forma parte de una receta no se elimina).
 */
router.get('/insumos/:id/recetas', async (req, res) => {
  res.json({ recetas: await insumoModel.contarRecetasQueLoUsan(Number(req.params.id)) });
});

/**
 * HU-30 · Las órdenes de producción finalizadas en un período, para el reporte
 * que arma ms-reportes (composición por API). Lleva lo que consumió cada una,
 * guardado al finalizarla (HU-10): el costo no cambia si después sube un insumo.
 */
router.get('/ordenes/reporte', async (req, res) => {
  const fecha = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
  const desde = fecha(req.query.desde);
  const hasta = fecha(req.query.hasta);
  if (!desde || !hasta) {
    res.status(400).json({ error: 'Indique desde y hasta (fechas ISO)' });
    return;
  }
  const idProducto = Number(req.query.idProducto) > 0 ? Number(req.query.idProducto) : undefined;
  const ordenes = await prisma.orden_produccion.findMany({
    where: {
      estado: 'Finalizada',
      fecha_finalizacion: { gte: desde, lte: hasta },
      ...(idProducto ? { receta: { id_producto: idProducto } } : {}),
    },
    orderBy: { fecha_finalizacion: 'asc' },
    include: { receta: { include: { producto: { select: { id_producto: true, nombre: true } } } }, detalle_orden_insumo: true },
  });
  const producto = idProducto
    ? ((await prisma.producto.findUnique({ where: { id_producto: idProducto }, select: { nombre: true } }))?.nombre ?? null)
    : null;
  res.json({
    producto,
    ordenes: ordenes.map((o) => ({
      idOrden: o.id_orden_produccion,
      fecha: (o.fecha_finalizacion ?? o.fecha).toISOString(),
      idProducto: o.receta.producto.id_producto,
      producto: o.receta.producto.nombre,
      receta: o.receta.nombre,
      cantidad: o.cantidad,
      cantidadObtenida: o.cantidad_obtenida ?? o.cantidad,
      costoTotal: o.costo_total === null ? null : Number(o.costo_total),
      insumos: o.detalle_orden_insumo.map((d) => ({
        idInsumo: d.id_ingrediente,
        insumo: d.nombre,
        unidad: d.unidad,
        cantidad: Number(d.cantidad),
        costoUnitario: Number(d.costo_unitario),
      })),
    })),
  });
});

export default router;
