import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { modulosAccesibles, SPRINT_ACTUAL } from '@/lib/modulos';
import { EntradaModulo } from '@/components/EntradaModulo';

/**
 * Un módulo con pestañas se muestra si alguna se puede abrir, y se entra por
 * esa (RF-SEG-08). Producción pedía gestionar productos para aparecer, y al
 * cocinero con solo el permiso de órdenes no le quedaba cómo llegar a ellas.
 *
 * La pestaña Órdenes llega en el Sprint 3 (ms-produccion): las pruebas que la
 * necesitan esperan a ese sprint y se activan solas al subir SPRINT_ACTUAL.
 */
const conOrdenes = SPRINT_ACTUAL >= 3;

const con =
  (...permisos: string[]) =>
  (permiso: string) =>
    permisos.includes(permiso);

const entradaDe = (ruta: string, tienePermiso: (p: string) => boolean, cargo = 'Cocinero') =>
  modulosAccesibles(tienePermiso, cargo).find((m) => m.ruta === ruta)?.entrada;

describe('modulosAccesibles', () => {
  it.runIf(conOrdenes)('quien solo produce ve Producción y entra por sus órdenes', () => {
    expect(entradaDe('/produccion', con('ORDEN_PRODUCCION_GESTIONAR'))).toBe('/produccion/ordenes');
  });

  it('quien además gestiona productos entra por el catálogo, como antes', () => {
    expect(entradaDe('/produccion', con('PRODUCTO_GESTIONAR', 'ORDEN_PRODUCCION_GESTIONAR'))).toBe(
      '/produccion/productos',
    );
  });

  it('quien solo cobra ve Ventas y entra por el punto de venta', () => {
    expect(entradaDe('/ventas', con('VENTA_REGISTRAR'), 'Vendedor')).toBe('/ventas/registro');
  });

  it('antes de las órdenes, quien solo produce todavía no ve Producción', () => {
    if (conOrdenes) return;
    expect(entradaDe('/produccion', con('ORDEN_PRODUCCION_GESTIONAR'))).toBeUndefined();
  });

  it('sin ninguna pestaña permitida, el módulo no aparece', () => {
    expect(entradaDe('/produccion', con('PEDIDO_LEER'))).toBeUndefined();
  });

  it('una pestaña sin permiso propio pide el del módulo', () => {
    // Las de Inventario no declaran permiso: sin STOCK_CONSULTAR no se abre ninguna.
    expect(entradaDe('/inventario', con('INGRESO_REGISTRAR'), 'Almacenero')).toBeUndefined();
    expect(entradaDe('/inventario', con('STOCK_CONSULTAR'), 'Almacenero')).toBe('/inventario/stock');
  });
});

const reemplazar = vi.fn();
let permisos = con('ORDEN_PRODUCCION_GESTIONAR');

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: reemplazar }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ tienePermiso: (p: string) => permisos(p) }),
}));

describe('EntradaModulo', () => {
  beforeEach(() => reemplazar.mockClear());

  it.runIf(conOrdenes)('la raíz de Producción lleva a la primera pestaña que se puede abrir', () => {
    render(<EntradaModulo ruta="/produccion" />);
    expect(reemplazar).toHaveBeenCalledWith('/produccion/ordenes');
  });

  it('sin ninguna, vuelve al inicio en vez de a un «Acceso no autorizado»', () => {
    permisos = con();
    render(<EntradaModulo ruta="/produccion" />);
    expect(reemplazar).toHaveBeenCalledWith('/inicio');
  });
});
