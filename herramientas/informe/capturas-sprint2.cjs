// Capturas del incremento del Sprint 2 (sección 3.3.6). Uso: node capturas_sprint2.cjs <raiz-del-repo>
const path = require('node:path');
const raiz = process.argv[2];
const { chromium } = require(path.join(raiz, 'frontend/node_modules/playwright'));
const salida = path.join(raiz, 'docs/informe/imagenes/sprint2');

async function entrar(page, usuario, clave, destino) {
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(destino);
}

async function foto(page, ruta, archivo, espera) {
  await page.goto('http://localhost:3000' + ruta);
  await page.waitForLoadState('networkidle');
  if (espera) await page.getByText(espera).first().waitFor();
  await page.waitForTimeout(1200); // terminan las animaciones de entrada
  await page.screenshot({ path: path.join(salida, archivo) });
  console.log('captura:', archivo);
}

(async () => {
  const navegador = await chromium.launch({ channel: 'chrome' });
  const opciones = { viewport: { width: 1366, height: 800 }, locale: 'es-BO', timezoneId: 'America/La_Paz', colorScheme: 'light' };

  const personal = await (await navegador.newContext(opciones)).newPage();
  await entrar(personal, 'admin', 'Admin1234!', /\/inicio/);
  await foto(personal, '/produccion/productos', '3.3.6-productos.png', 'Ensalada Cesar con pollo');
  await foto(personal, '/inventario/stock', '3.3.6-stock.png', 'Control de stock');
  await foto(personal, '/inventario/insumos', '3.3.6-insumos.png', 'Aceite de oliva');
  await foto(personal, '/inventario/movimientos', '3.3.6-movimientos.png', 'ING-0001');
  await personal.getByRole('button', { name: 'Registrar ingreso' }).click();
  await personal.getByRole('dialog').waitFor();
  await personal.waitForTimeout(3000);
  await personal.screenshot({ path: path.join(salida, '3.3.6-nota-de-ingreso.png') });
  console.log('captura: 3.3.6-nota-de-ingreso.png');
  await foto(personal, '/inventario/lotes', '3.3.6-lotes.png', 'ING-0001');

  const cliente = await (await navegador.newContext(opciones)).newPage();
  await entrar(cliente, 'cliente', 'Cliente2026!', /\/portal/);
  await foto(cliente, '/portal', '3.3.6-portal-catalogo.png', 'Ensalada Cesar con pollo');
  await cliente.getByLabel('Buscar productos e información').fill('ensalada');
  await cliente.waitForTimeout(1500);
  await cliente.screenshot({ path: path.join(salida, '3.3.6-busqueda.png') });
  console.log('captura: 3.3.6-busqueda.png');

  await navegador.close();
})().catch((e) => { console.error(e); process.exit(1); });
