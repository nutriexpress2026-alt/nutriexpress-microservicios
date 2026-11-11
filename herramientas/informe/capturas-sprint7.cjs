// Capturas del incremento del Sprint 7 (sección 3.8.3). Uso: node capturas-sprint7.cjs <raiz-del-repo>
//
// Necesita el frontend compilado en el puerto 3000 y docker compose levantado, con órdenes de
// producción finalizadas y movimientos de inventario (los de los sprints anteriores sirven).
const path = require('node:path');
const fs = require('node:fs');
const raiz = process.argv[2];
const { chromium } = require(path.join(raiz, 'frontend/node_modules/playwright'));
const salida = path.join(raiz, 'docs/informe/imagenes/sprint7');
fs.mkdirSync(salida, { recursive: true });
const DESDE = '2026-10-01';
const HASTA = '2026-11-30';

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
  await page.waitForTimeout(esperaMs);
  await page.screenshot({ path: path.join(salida, archivo) });
  console.log('captura:', archivo);
}

async function reporte(page, ruta, titulo, seccion) {
  await ir(page, ruta, titulo);
  await page.getByLabel('Desde').fill(DESDE);
  await page.getByLabel('Hasta').fill(HASTA);
  await page.getByLabel('Hasta').press('Tab');
  await page.waitForLoadState('networkidle');
  await page.getByText(seccion).first().waitFor({ timeout: 60000 });
}

(async () => {
  const navegador = await chromium.launch({ channel: 'chrome' });
  const opciones = { viewport: { width: 1366, height: 800 }, locale: 'es-BO', timezoneId: 'America/La_Paz', colorScheme: 'light' };

  const admin = await (await navegador.newContext(opciones)).newPage();
  await entrar(admin, 'admin', 'Admin1234!', /\/inicio/);

  // HU-30: producción y movimientos de inventario.
  await reporte(admin, '/produccion/reportes', 'Reporte de producción', 'Insumos consumidos');
  await foto(admin, '3.8.6-reporte-produccion.png');
  await reporte(admin, '/inventario/reportes', 'Reporte de movimientos', 'Movimiento por ítem');
  await foto(admin, '3.8.6-reporte-inventario.png');

  // HU-07: el perfil propio, con el cambio de contraseña a la vista (no se envía).
  const cliente = await (await navegador.newContext(opciones)).newPage();
  await entrar(cliente, 'cliente', 'Cliente2026!', /\/portal/);
  await ir(cliente, '/portal/perfil', 'Contraseña');
  await cliente.getByRole('heading', { name: 'Contraseña' }).scrollIntoViewIfNeeded();
  await foto(cliente, '3.8.6-perfil.png');

  await navegador.close();
})().catch((e) => { console.error(e); process.exit(1); });
