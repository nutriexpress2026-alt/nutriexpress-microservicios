// Capturas del incremento del Sprint 3 (sección 3.4.6). Uso: node capturas-sprint3.cjs <raiz-del-repo>
//
// Necesita el frontend compilado en el puerto 3000, docker compose levantado y datos de
// demostración: recetas activas de «Ensalada Cesar con pollo», «Bowl de quinua y verduras» y
// «Barra de avena y almendras», y una orden en cada estado (la finalizada, de 8 ensaladas).
const path = require('node:path');
const raiz = process.argv[2];
const { chromium } = require(path.join(raiz, 'frontend/node_modules/playwright'));
const salida = path.join(raiz, 'docs/informe/imagenes/sprint3');
require('node:fs').mkdirSync(salida, { recursive: true });

async function entrar(page, usuario, clave, destino) {
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(destino);
}

async function ir(page, ruta, espera) {
  await page.goto('http://localhost:3000' + ruta);
  await page.waitForLoadState('networkidle');
  if (espera) await page.getByText(espera).first().waitFor();
}

async function foto(page, archivo) {
  await page.waitForTimeout(1200); // terminan las animaciones de entrada
  await page.screenshot({ path: path.join(salida, archivo) });
  console.log('captura:', archivo);
}

(async () => {
  const navegador = await chromium.launch({ channel: 'chrome' });
  const opciones = { viewport: { width: 1366, height: 800 }, locale: 'es-BO', timezoneId: 'America/La_Paz', colorScheme: 'light' };

  // HU-09: versiones de la receta de un producto, una activa, con su costo.
  const admin = await (await navegador.newContext(opciones)).newPage();
  await entrar(admin, 'admin', 'Admin1234!', /\/inicio/);
  await ir(admin, '/produccion/productos', 'Ensalada Cesar con pollo');
  await admin.getByRole('button', { name: /Ensalada Cesar con pollo/ }).first().click();
  await admin.getByRole('button', { name: 'Recetas', exact: true }).click();
  await admin.getByText('Clasica').first().waitFor();
  await foto(admin, '3.4.6-recetas.png');

  // HU-10: las órdenes las lleva el cocinero.
  const cocinero = await (await navegador.newContext(opciones)).newPage();
  await entrar(cocinero, 'cocinero', 'Cocinero2026!', /\/inicio/);
  await ir(cocinero, '/produccion/ordenes', 'Ensalada Cesar con pollo');
  await foto(cocinero, '3.4.6-ordenes.png');

  const finalizada = cocinero.getByRole('listitem').filter({ hasText: '8 × Ensalada Cesar con pollo' });
  await finalizada.locator('button[aria-expanded]').click();
  await finalizada.getByText(/Egreso EGR-/).waitFor();
  await finalizada.scrollIntoViewIfNeeded();
  await foto(cocinero, '3.4.6-orden-finalizada.png');

  await ir(cocinero, '/produccion/ordenes', 'Ensalada Cesar con pollo');
  await cocinero.getByRole('button', { name: 'Nueva orden' }).click();
  const formulario = cocinero.getByRole('dialog', { name: 'Nueva orden de producción' });
  await formulario.getByRole('combobox', { name: 'Receta activa' }).click();
  await cocinero.getByRole('option', { name: /Bowl de quinua/ }).click();
  await formulario.getByLabel('Porciones a producir').fill('6');
  await formulario.getByText('Insumos que consumirá').waitFor();
  await foto(cocinero, '3.4.6-nueva-orden.png');

  // HU-10 en inventario: las notas de la producción.
  await ir(admin, '/inventario/movimientos', 'EGR-0004');
  await foto(admin, '3.4.6-movimientos-produccion.png');

  // HU-06: recuperar la contraseña con un código por correo.
  const visitante = await (await navegador.newContext(opciones)).newPage();
  await ir(visitante, '/recuperar', 'Enviar código');
  await visitante.getByLabel('Correo o nombre de usuario').fill('cliente');
  await visitante.getByRole('button', { name: 'Enviar código' }).click();
  await visitante.getByText('Escriba el código de 6 dígitos').waitFor();
  await foto(visitante, '3.4.6-recuperar-codigo.png');

  await navegador.close();
})().catch((e) => { console.error(e); process.exit(1); });
