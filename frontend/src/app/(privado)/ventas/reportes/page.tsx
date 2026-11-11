'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RequierePermiso } from '@/components/RequierePermiso';
import { Selector } from '@/components/ui/Selector';
import { MarcoReporte } from '@/components/reportes/MarcoReporte';
import { Cifra, Cifras, TablaReporte } from '@/components/reportes/PiezasReporte';
import { CifrasGanancia, columnasGanancia } from '@/components/reportes/Ganancia';
import type { LineaProductoReporte, ProductoCatalogo, ReporteVentas } from '@/types';
import { formatearBs } from '@/lib/formato';
import { formatearPorcentaje } from '@/lib/formato';

/**
 * RF-VEN-07 — reporte parametrizado de ventas por rango de fechas y producto,
 * exportable a PDF y enviable por correo electrónico.
 *
 * Es lo que convierte al sistema de *"registra datos"* en *"me dice cómo va el
 * negocio"*. Por eso lo primero que se ve son las cifras del resumen —cuánto se
 * vendió y cuánto se ganó—, y el detalle viene después: quien abre esta
 * pantalla quiere una respuesta, no una tabla. Filtrado por un producto, todo
 * es de ese producto, también la ganancia.
 */
export default function PaginaReportes() {
  return (
    <RequierePermiso permiso="VENTA_LEER">
      <Reportes />
    </RequierePermiso>
  );
}

function Reportes() {
  const [idProducto, setIdProducto] = useState<number | null>(null);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [idVendedor, setIdVendedor] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<{ id: number; nombre: string }[]>([]);

  useEffect(() => {
    // HU-28 · Los vendedores que vendieron alguna vez (los conoce ms-reportes).
    api
      .get<{ id: number; nombre: string }[]>('/reportes/ventas/vendedores')
      .then(setVendedores)
      .catch(() => {});
    api
      .get<ProductoCatalogo[]>('/catalogo')
      .then(setProductos)
      .catch(() => {
        // Sin la lista, el filtro por producto queda vacío y el reporte
        // general sigue funcionando. No vale interrumpir por eso.
      });
  }, []);

  return (
    <MarcoReporte<ReporteVentas>
      titulo="Reporte de ventas"
      descripcion="Cuánto se vendió, cuánto se ganó y por qué medio se cobró"
      recurso="ventas"
      filtros={{ idProducto: idProducto ?? undefined, idVendedor: idVendedor ?? undefined }}
      controles={
        // HU-28 · «Por fechas, producto y vendedor»: los dos filtros en su propia fila.
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
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
          <Selector<number>
            etiqueta="Vendedor"
            valor={idVendedor}
            marcador="Todos los vendedores"
            onCambiar={(v) => setIdVendedor(v === -1 ? null : v)}
            opciones={[
              { valor: -1, etiqueta: 'Todos los vendedores' },
              ...vendedores.map((v) => ({ valor: v.id, etiqueta: v.nombre })),
            ]}
          />
        </div>
      }
      vacio={(r) => r.resumen.cantidadVentas === 0}
      tituloVacio="Sin ventas en el período"
    >
      {(reporte) => (
        <>
          <Cifras>
            <Cifra etiqueta="Ventas" valor={String(reporte.resumen.cantidadVentas)} />
            <Cifra etiqueta="Unidades" valor={String(reporte.resumen.unidades)} />
            <Cifra etiqueta="Total" valor={formatearBs(reporte.resumen.total)} destacada />
            <Cifra
              etiqueta="Ticket promedio"
              valor={formatearBs(reporte.resumen.ticketPromedio)}
            />
          </Cifras>

          <CifrasGanancia ganancia={reporte.resumen} />

          {reporte.anuladas && reporte.anuladas.cantidad > 0 && (
            <p className="text-sm text-tinta-suave">
              {reporte.anuladas.cantidad} venta(s) anulada(s) por {formatearBs(reporte.anuladas.total)} no
              suman en el total.
            </p>
          )}

          <TablaReporte
            titulo="Por producto"
            filas={reporte.porProducto}
            clave={(p) => p.idProducto}
            columnas={[
              { titulo: 'Producto', celda: (p) => p.nombre },
              { titulo: 'Unidades', numerica: true, celda: (p) => p.unidades },
              { titulo: 'Importe', numerica: true, celda: (p) => formatearBs(p.importe) },
              {
                titulo: '% del total',
                numerica: true,
                celda: (p) => formatearPorcentaje(p.participacion),
              },
              ...columnasGanancia<LineaProductoReporte>(),
            ]}
          />

          {reporte.porVendedor && (
            <TablaReporte
              titulo="Por vendedor"
              filas={reporte.porVendedor}
              clave={(v) => v.idVendedor}
              columnas={[
                { titulo: 'Vendedor', celda: (v) => v.vendedor },
                { titulo: 'Ventas', numerica: true, celda: (v) => v.cantidadVentas },
                { titulo: 'Total', numerica: true, celda: (v) => formatearBs(v.total) },
              ]}
            />
          )}

          <TablaReporte
            titulo="Por método de pago"
            filas={reporte.porMetodoPago}
            clave={(m) => m.metodo}
            columnas={[
              { titulo: 'Método', celda: (m) => m.metodo },
              { titulo: 'Ventas', numerica: true, celda: (m) => m.cantidadVentas },
              { titulo: 'Total', numerica: true, celda: (m) => formatearBs(m.total) },
            ]}
          />
        </>
      )}
    </MarcoReporte>
  );
}
