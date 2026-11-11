// Capturas del incremento del Sprint 6 (sección 3.7.3). Uso: node capturas-sprint6.cjs <raiz-del-repo>
//
// Necesita el frontend compilado en el puerto 3000 y docker compose levantado, con ventas y pedidos
// ya registrados (los de los Sprints 4 y 5 sirven). El PDF del reporte se guarda aparte
// (reporte-ventas.pdf) y se convierte en imagen con PyMuPDF.
const path = require('node:path');
const fs = require('node:fs');
const raiz = process.argv[2];
const { chromium } = require(path.join(raiz, 'frontend/node_modules/playwright'));
const salida = path.join(raiz, 'docs/informe/imagenes/sprint6');
fs.mkdirSync(salida, { recursive: true });
const API = 'http://127.0.0.1:8080/api'; // 127.0.0.1: en Windows, «localhost» puede ir por IPv6 y Docker no responde ahí
const DESDE = '2026-11-01';
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

/** Un reporte con fechas del mes y su resultado a la vista. */
async function reporte(page, ruta, titulo) {
  await ir(page, ruta, titulo);
  await page.getByLabel('Desde').fill(DESDE);
  await page.getByLabel('Hasta').fill(HASTA);
  await page.getByLabel('Hasta').press('Tab');
  await page.waitForLoadState('networkidle');
  await page.getByText('Por producto').first().waitFor({ timeout: 60000 });
}

(async () => {
  const navegador = await chromium.launch({ channel: 'chrome' });
  const opciones = { viewport: { width: 1366, height: 800 }, locale: 'es-BO', timezoneId: 'America/La_Paz', colorScheme: 'light' };

  const admin = await (await navegador.newContext(opciones)).newPage();
  await entrar(admin, 'admin', 'Admin1234!', /\/inicio/);

  // HU-28: el reporte de ventas del mes, con la tabla por vendedor.
  await reporte(admin, '/ventas/reportes', 'Reporte de ventas');
  await admin.getByText('Por vendedor').first().scrollIntoViewIfNeeded();
  await foto(admin, '3.7.6-reporte-ventas.png');

  // HU-28: enviarlo a dos cuentas.
  await admin.getByRole('button', { name: 'Enviar por correo' }).click();
  const dialogo = admin.getByRole('dialog', { name: 'Enviar el reporte' });
  await dialogo.getByLabel('Correo de los destinatarios').fill('gerencia@tecnologia.web, ventas@tecnologia.web');
  await dialogo.getByText(/llegará a 2 cuentas/).waitFor({ timeout: 30000 });
  await foto(admin, '3.7.6-enviar-reporte.png', 600);
  await admin.keyboard.press('Escape');

  // HU-29: el reporte de pedidos, con asignados y entregados por repartidor.
  await reporte(admin, '/pedidos/reportes', 'Reporte de pedidos');
  await admin.getByText('Por repartidor').first().scrollIntoViewIfNeeded();
  await foto(admin, '3.7.6-reporte-pedidos.png');

  // El PDF del reporte de ventas, para convertirlo en imagen.
  const sesion = await (
    await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombreUsuario: 'admin', contrasena: 'Admin1234!' }) })
  ).json();
  const pdf = await fetch(`${API}/reportes/ventas.pdf?desde=${DESDE}&hasta=${HASTA}`, { headers: { Authorization: `Bearer ${sesion.token}` } });
  fs.writeFileSync(path.join(salida, 'reporte-ventas.pdf'), Buffer.from(await pdf.arrayBuffer()));
  console.log('pdf: reporte-ventas.pdf');

  // HU-33: el tema Niños en modo día, elegido por la cliente.
  const cliente = await (await navegador.newContext(opciones)).newPage();
  await entrar(cliente, 'cliente', 'Cliente2026!', /\/portal/);
  await cliente.getByRole('button', { name: /apariencia/i }).first().click();
  await cliente.getByText('Niños').click();
  await cliente.getByText('Día', { exact: true }).click();
  await cliente.keyboard.press('Escape');
  await cliente.getByRole('button', { name: 'Agregar', exact: true }).first().waitFor({ timeout: 60000 }).catch(() => {});
  await foto(cliente, '3.7.6-tema-ninos.png', 1500);
  // Se deja como estaba: Jóvenes y automático.
  await cliente.getByRole('button', { name: /apariencia/i }).first().click();
  await cliente.getByText('Jóvenes').click();
  await cliente.getByText('Automático').click();

  await navegador.close();
})().catch((e) => { console.error(e); process.exit(1); });
