import { test, expect, type Page } from '@playwright/test';
import { ADMIN, iniciarSesion, registrarCliente } from './ayudantes';
import { SPRINT_ACTUAL } from '../src/lib/modulos';

/**
 * Requisito 1 del proyecto: los casos de uso, recorridos de punta a punta.
 *
 * Un cliente arma su carrito y pide a domicilio (HU-21), lo ve en «Mis pedidos»
 * (HU-25) y, si paga con QR, la pasarela simulada lo cobra (HU-26). Es el
 * camino que ninguna otra suite recorre entero: el frontend, el gateway,
 * ms-catalogo, ms-inventario, ms-pedidos, ms-pagos y RabbitMQ a la vez.
 */

/** Del catálogo al paso de entrega, con el primer producto que tenga stock. */
async function alCarrito(page: Page) {
  await page.getByRole('button', { name: 'Agregar', exact: true }).first().click();
  await page.getByRole('link', { name: 'Carrito con 1 artículo(s)' }).click();
  await expect(page.getByRole('heading', { name: 'Su pedido' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Entrega: la primera vez se escribe la dirección.
  await expect(page.getByRole('heading', { name: 'Entrega y pago' })).toBeVisible();
  await page.getByLabel('Calle o avenida').fill('Avenida Banzer');
  await page.getByLabel('Número').fill('1200');
  await page.getByLabel('Referencia').fill('Portón verde, frente al parque');
}

test.describe('Pedido a domicilio', () => {
  // El pedido a domicilio llega con ms-pedidos y ms-pagos, en el Sprint 4.
  test.skip(SPRINT_ACTUAL < 4, 'Los pedidos se implementan en el Sprint 4');

  test('un cliente pide en efectivo y lo ve en «Mis pedidos»', async ({ page, request }) => {
    const cliente = await registrarCliente(request);
    await iniciarSesion(page, cliente.usuario, cliente.contrasena);
    await expect(page).toHaveURL(/\/portal/);

    await alCarrito(page);
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    // Confirmado: aparece en «Mis pedidos» con su número, esperando que lo preparen.
    await expect(page).toHaveURL(/\/portal\/pedidos/);
    const aviso = page.getByText(/Pedido #(\d{5}) confirmado/);
    await expect(aviso).toBeVisible();
    const numero = (await aviso.textContent())!.match(/#(\d{5})/)![1];
    await expect(page.getByText(`#${numero}`).first()).toBeVisible();

    // El personal lo encuentra en su tablero (HU-23, Sprint 5).
    if (SPRINT_ACTUAL >= 5) {
      await page.evaluate(() => localStorage.clear());
      await iniciarSesion(page, ADMIN.usuario, ADMIN.contrasena);
      await expect(page).toHaveURL(/\/inicio$/);
      await page.goto(`/pedidos/lista?pedido=${Number(numero)}`);
      await expect(page.getByText(`#${numero}`).first()).toBeVisible();
    }
  });

  test('un cliente paga con QR, la pasarela simulada lo cobra y recibe su comprobante', async ({ page, request }) => {
    const cliente = await registrarCliente(request);
    await iniciarSesion(page, cliente.usuario, cliente.contrasena);
    await expect(page).toHaveURL(/\/portal/);

    await alCarrito(page);
    await page.getByRole('button', { name: /^QR/ }).click();
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    // El cobro muestra el código y, simulado, se acredita a los pocos segundos.
    const cobro = page.getByRole('dialog', { name: 'Cobrar' });
    await expect(cobro.getByRole('img').first()).toBeVisible();
    await expect(page.getByText('Pago recibido')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar' }).click();

    // El comprobante del pedido pagado (los datos los da ms-pedidos).
    const comprobante = page.getByRole('dialog', { name: 'Comprobante' });
    await expect(comprobante.getByText(/Pedido #\d{5}/)).toBeVisible({ timeout: 15_000 });
  });
});
