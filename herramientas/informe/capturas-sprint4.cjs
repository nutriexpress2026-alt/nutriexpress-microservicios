// Capturas del incremento del Sprint 4 (sección 3.5.6). Uso: node capturas-sprint4.cjs <raiz-del-repo>
//
// Necesita el frontend compilado en el puerto 3000 y docker compose levantado, con stock de
// productos terminados. Prepara por la API las dos direcciones guardadas del cliente de prueba
// («Casa», la principal, y «Oficina») si todavía no las tiene.
const path = require('node:path');
const raiz = process.argv[2];
const { chromium } = require(path.join(raiz, 'frontend/node_modules/playwright'));
const salida = path.join(raiz, 'docs/informe/imagenes/sprint4');
require('node:fs').mkdirSync(salida, { recursive: true });
const API = 'http://localhost:8080/api';

async function entrar(page, usuario, clave, destino) {
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(destino, { timeout: 90000 });
}

async function ir(page, ruta, espera) {
  await page.goto('http://localhost:3000' + ruta);
  await page.waitForLoadState('networkidle');
  if (espera) await page.getByText(espera).first().waitFor({ timeout: 60000 });
}

async function foto(page, archivo, esperaMs = 1200) {
  await page.waitForTimeout(esperaMs); // terminan las animaciones de entrada
  await page.screenshot({ path: path.join(salida, archivo) });
  console.log('captura:', archivo);
}

/** HU-22: el cliente de prueba con dos direcciones guardadas, la de su casa como principal. */
async function prepararDirecciones() {
  const sesion = await (
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombreUsuario: 'cliente', contrasena: 'Cliente2026!' }),
    })
  ).json();
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` };
  const guardadas = await (await fetch(`${API}/ubicaciones`, { headers: h })).json();
  if (guardadas.length > 0) return;
  const crear = (d) => fetch(`${API}/ubicaciones`, { method: 'POST', headers: h, body: JSON.stringify(d) }).then((r) => r.json());
  const casa = await crear({ etiqueta: 'Casa', calle: 'Avenida Banzer', numero: '1200', referencia: 'Portón verde, frente al parque', latitud: -17.75012, longitud: -63.17541 });
  await crear({ etiqueta: 'Oficina', calle: 'Calle Libertad', numero: '45', referencia: 'Edificio azul, piso 3', latitud: -17.78411, longitud: -63.18153 });
  await fetch(`${API}/ubicaciones/${casa.id}/principal`, { method: 'PUT', headers: h });
}

(async () => {
  await prepararDirecciones();
  const navegador = await chromium.launch({ channel: 'chrome' });
  const opciones = { viewport: { width: 1366, height: 800 }, locale: 'es-BO', timezoneId: 'America/La_Paz', colorScheme: 'light' };

  // HU-21, HU-22: el carrito confirmado, con la dirección principal elegida y el pago con QR.
  const cliente = await (await navegador.newContext(opciones)).newPage();
  await entrar(cliente, 'cliente', 'Cliente2026!', /\/portal/);
  const agregar = cliente.getByRole('button', { name: 'Agregar', exact: true });
  await agregar.first().waitFor({ timeout: 60000 });
  await agregar.nth(0).click();
  await agregar.nth(0).click();
  await cliente.getByRole('link', { name: /Carrito con/ }).click();
  await cliente.getByRole('button', { name: 'Continuar' }).click();
  await cliente.getByText('Casa · principal').waitFor({ timeout: 60000 });
  await cliente.getByRole('button', { name: /^QR/ }).click();
  await foto(cliente, '3.5.6-entrega-y-pago.png');

  // HU-26: el cobro con QR de la pasarela simulada (se toma antes de que se acredite).
  await cliente.getByRole('button', { name: 'Confirmar pedido' }).click();
  const cobro = cliente.getByRole('dialog', { name: 'Cobrar' });
  await cobro.getByRole('img').first().waitFor({ timeout: 90000 });
  await foto(cliente, '3.5.6-cobro-qr.png', 300);

  // Se acredita solo: aparece el comprobante del pedido pagado.
  await cliente.getByText('Pago acreditado. Su pedido entró a preparación').waitFor({ timeout: 90000 });
  await cliente.getByText(/Pedido #\d{5}/).first().waitFor();
  await foto(cliente, '3.5.6-comprobante.png');

  // HU-25: «Mis pedidos», con cada estado y el que se puede cancelar.
  await ir(cliente, '/portal/pedidos', 'Mis pedidos');
  await cliente.getByText(/#\d{5}/).first().waitFor({ timeout: 60000 });
  await foto(cliente, '3.5.6-mis-pedidos.png');

  // HU-27: el modo de cobro, que solo cambia el administrador.
  const admin = await (await navegador.newContext(opciones)).newPage();
  await entrar(admin, 'admin', 'Admin1234!', /\/inicio/);
  await ir(admin, '/perfil', 'Modo de cobro');
  await admin.getByText('Modo de cobro').first().scrollIntoViewIfNeeded();
  await foto(admin, '3.5.6-modo-cobro.png');

  await navegador.close();
})().catch((e) => { console.error(e); process.exit(1); });
