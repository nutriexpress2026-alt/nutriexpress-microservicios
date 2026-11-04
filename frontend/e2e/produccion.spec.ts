import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, API, iniciarSesion, sufijo } from './ayudantes';
import { SPRINT_ACTUAL } from '../src/lib/modulos';

/**
 * HU-10 Órdenes de producción, desde el navegador: el cocinero registra una
 * orden con la receta activa, la inicia y la finaliza con merma; inventario
 * genera las notas de egreso e ingreso y la orden las muestra.
 *
 * Recorre los tres servicios: la receta y la orden en ms-catalogo, la reserva y
 * las notas en ms-inventario, y los eventos OrdenFinalizada y
 * ProduccionRegistrada entre los dos por RabbitMQ.
 *
 * El insumo, el producto y su receta se crean por la API, con un sufijo para no
 * chocar con corridas anteriores: no son lo que se prueba aquí. Al terminar, el
 * producto se da de baja para que no aparezca en el catálogo.
 */
const COCINERO = {
  usuario: process.env.E2E_COCINERO_USUARIO ?? 'cocinero',
  contrasena: process.env.E2E_COCINERO_CLAVE ?? 'Cocinero2026!',
};

async function sesionDeAdmin(request: APIRequestContext) {
  const r = await request.post(`${API}/auth/login`, {
    data: { nombreUsuario: ADMIN.usuario, contrasena: ADMIN.contrasena },
  });
  expect(r.ok(), `sesión del administrador: ${await r.text()}`).toBeTruthy();
  return { Authorization: `Bearer ${(await r.json()).token}` };
}

async function crear(request: APIRequestContext, ruta: string, cabeceras: Record<string, string>, data: object) {
  const r = await request.post(`${API}${ruta}`, { headers: cabeceras, data });
  expect(r.ok(), `POST ${ruta}: ${await r.text()}`).toBeTruthy();
  return r.json();
}

test.describe('Producción', () => {
  test.skip(SPRINT_ACTUAL < 3, 'Las órdenes de producción se implementan en el Sprint 3');

  const marca = sufijo();
  const nombreInsumo = `Espinaca e2e ${marca}`;
  const nombreProducto = `Batido verde e2e ${marca}`;
  let idProducto: number;

  test.beforeAll(async ({ request }) => {
    const admin = await sesionDeAdmin(request);
    const unidades = await (await request.get(`${API}/insumos/unidades`, { headers: admin })).json();
    const almacenes = await (await request.get(`${API}/almacenes`, { headers: admin })).json();
    const camara = almacenes.find((a: { tipoConservacion: string }) => a.tipoConservacion === 'Refrigerado');

    // 5 kg a Bs 10 en la cámara.
    const insumo = await crear(request, '/insumos', admin, {
      nombre: nombreInsumo,
      idUnidad: unidades.find((u: { nombre: string }) => u.nombre === 'Kilogramo').id,
      stockMinimo: 0,
      tipoConservacion: 'Refrigerado',
    });
    await crear(request, '/ingresos', admin, {
      motivo: 'Compra',
      proveedor: 'Huerto e2e',
      insumos: [{ idIngrediente: insumo.id, idAlmacen: camara.id, cantidad: 5, costoUnitario: 10 }],
    });

    const categorias = await (await request.get(`${API}/catalogo/categorias`)).json();
    idProducto = (
      await crear(request, '/productos', admin, {
        nombre: nombreProducto,
        precioVenta: 25,
        idCategoria: categorias[0].id,
        tipoConservacion: 'Refrigerado',
      })
    ).id;

    // El insumo llega a la réplica del catálogo por el evento InsumoGuardado.
    let receta: { id: number } | null = null;
    await expect(async () => {
      const r = await request.post(`${API}/productos/${idProducto}/recetas`, {
        headers: admin,
        data: {
          nombre: 'Base',
          rendimiento: 2,
          tiempoPreparacionMinutos: 10,
          divisible: true,
          insumos: [{ idIngrediente: insumo.id, cantidadRequerida: 0.5 }],
        },
      });
      expect(r.status(), await r.text()).toBe(201);
      receta = await r.json();
    }).toPass({ timeout: 15_000 });
    await crear(request, `/recetas/${receta!.id}/activar`, admin, {});
  });

  test.afterAll(async ({ request }) => {
    if (!idProducto) return;
    const admin = await sesionDeAdmin(request);
    await request.put(`${API}/productos/${idProducto}`, { headers: admin, data: { activo: false } });
  });

  test('el cocinero registra, inicia y finaliza una orden; inventario genera sus notas', async ({ page }) => {
    await iniciarSesion(page, COCINERO.usuario, COCINERO.contrasena);
    await expect(page).toHaveURL(/\/inicio$/);
    await page.goto('/produccion/ordenes');
    await expect(page.getByRole('heading', { name: 'Órdenes de producción' })).toBeVisible();

    // Registrar: 4 porciones de una receta que rinde 2 piden 1 kg.
    await page.getByRole('button', { name: 'Nueva orden' }).click();
    const formulario = page.getByRole('dialog', { name: 'Nueva orden de producción' });
    await formulario.getByRole('combobox', { name: 'Receta activa' }).click();
    await page.getByRole('option', { name: new RegExp(nombreProducto) }).click();
    await formulario.getByLabel('Porciones a producir').fill('4');
    await expect(formulario.getByText('Insumos que consumirá')).toBeVisible();
    await expect(formulario.getByRole('listitem').filter({ hasText: nombreInsumo })).toContainText('1 kg');
    await formulario.getByRole('button', { name: 'Registrar orden' }).click();
    await expect(page.getByText('Orden registrada en estado Pendiente')).toBeVisible();

    const tarjeta = page.getByRole('listitem').filter({ hasText: `4 × ${nombreProducto}` });
    await expect(tarjeta).toContainText('Pendiente');
    await tarjeta.locator('button[aria-expanded]').click();
    await expect(tarjeta.getByText('Insumos requeridos')).toBeVisible();

    // Iniciar.
    await tarjeta.getByRole('button', { name: 'Iniciar producción' }).click();
    await expect(tarjeta).toContainText('En proceso');

    // Finalizar con una porción de merma, en el único almacén refrigerado.
    await tarjeta.getByRole('button', { name: 'Registrar finalización' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar finalización' });
    await dialogo.getByLabel('Porciones obtenidas').fill('3');
    await expect(dialogo.getByText('Se registrarán 1 de merma')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Confirmar finalización' }).click();
    await expect(page.getByText('Orden finalizada con 1 de merma')).toBeVisible();
    await expect(tarjeta).toContainText('Finalizada');

    // Las notas llegan de inventario con ProduccionRegistrada: se ven al volver a cargar.
    await expect(async () => {
      await page.reload();
      const actual = page.getByRole('listitem').filter({ hasText: `4 × ${nombreProducto}` });
      await actual.locator('button[aria-expanded]').click();
      await expect(actual.getByText(/Egreso EGR-\d+/)).toBeVisible({ timeout: 2_000 });
      await expect(actual.getByText(/Ingreso ING-\d+/)).toBeVisible({ timeout: 2_000 });
      await expect(actual.getByText('Insumos consumidos')).toBeVisible();
    }).toPass({ timeout: 20_000 });
  });
});
