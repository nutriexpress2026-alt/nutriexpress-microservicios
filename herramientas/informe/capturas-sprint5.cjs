// Capturas del incremento del Sprint 5 (sección 3.6.3). Uso: node capturas-sprint5.cjs <raiz-del-repo>
//
// Necesita el frontend compilado en el puerto 3000 y docker compose levantado, con stock de
// productos terminados. Prepara por la API lo que se muestra: el repartidor de turno, un pedido en
// efectivo de la cliente de prueba en camino con él, otro recién recibido y una venta de mostrador.
const path = require('node:path');
const raiz = process.argv[2];
const { chromium } = require(path.join(raiz, 'frontend/node_modules/playwright'));
const salida = path.join(raiz, 'docs/informe/imagenes/sprint5');
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

async function sesion(usuario, contrasena) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombreUsuario: usuario, contrasena }),
  });
  const { token } = await r.json();
  return (metodo, ruta, cuerpo) =>
    fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }).then(async (x) => {
      const texto = await x.text();
      if (!x.ok) throw new Error(`${metodo} ${ruta}: ${x.status} ${texto}`);
      return texto ? JSON.parse(texto) : null;
    });
}

/** Un pedido en camino con el repartidor, otro recién recibido; devuelve el número del recibido. */
async function prepararPedidos() {
  const cliente = await sesion('cliente', 'Cliente2026!');
  const admin = await sesion('admin', 'Admin1234!');
  const repartidor = await sesion('repartidor', 'Reparto1234!');
  await repartidor('PUT', '/gestion/disponibilidad', { disponible: true });

  const catalogo = await cliente('GET', '/catalogo');
  const conStock = catalogo.filter((p) => (p.stockDisponible ?? 0) > 2).slice(0, 2);
  const direcciones = await cliente('GET', '/ubicaciones');
  const ubicacion = direcciones.length
    ? { idUbicacion: direcciones[0].id }
    : { calle: 'Avenida Banzer', numero: '1200', referencia: 'Portón verde, frente al parque', latitud: -17.75012, longitud: -63.17541 };
  const pedir = () =>
    cliente('POST', '/pedidos', { metodoPago: 'Efectivo', ubicacion, items: conStock.map((p) => ({ idProducto: p.id, cantidad: 1 })) });

  const enCamino = await pedir();
  const { datos: reps } = { datos: await admin('GET', '/gestion/repartidores') };
  const marcos = reps.find((r) => r.nombreCompleto.startsWith('Marcos'));
  await admin('PATCH', `/gestion/pedidos/${enCamino.id}/estado`, { estado: 'En preparacion' });
  await admin('PUT', `/gestion/pedidos/${enCamino.id}/repartidor`, { idRepartidor: marcos.id });
  await admin('PATCH', `/gestion/pedidos/${enCamino.id}/estado`, { estado: 'En camino' });
  await repartidor('PUT', '/gestion/mi-posicion', { latitud: -17.7633, longitud: -63.1806, precision: 12 });

  const recibido = await pedir();
  return recibido.id;
}

(async () => {
  const idRecibido = await prepararPedidos();
  const navegador = await chromium.launch({ channel: 'chrome' });
  const opciones = { viewport: { width: 1366, height: 800 }, locale: 'es-BO', timezoneId: 'America/La_Paz', colorScheme: 'light' };

  // HU-23: el tablero de pedidos y el panel de un pedido con la sugerencia de repartidor.
  const admin = await (await navegador.newContext(opciones)).newPage();
  await entrar(admin, 'admin', 'Admin1234!', /\/inicio/);
  await ir(admin, '/pedidos/lista', 'Recibidos');
  await admin.getByText(/#\d{5}/).first().waitFor({ timeout: 60000 });
  await foto(admin, '3.6.6-tablero.png');

  const numero = String(idRecibido).padStart(5, '0');
  await ir(admin, `/pedidos/lista?pedido=${idRecibido}`);
  const panel = admin.getByRole('dialog', { name: `Pedido #${numero}` });
  await panel.getByRole('button', { name: 'Poner en preparación' }).click();
  await panel.getByText('Sugerencia').waitFor({ timeout: 60000 });
  await panel.getByRole('heading', { name: 'Repartidor' }).scrollIntoViewIfNeeded();
  await foto(admin, '3.6.6-asignar-repartidor.png', 6000); // se va el aviso de «en preparación»

  // HU-24: «Mis entregas» del repartidor, con el pedido en camino.
  const repartidor = await (await navegador.newContext({ ...opciones, permissions: ['geolocation'], geolocation: { latitude: -17.7633, longitude: -63.1806 } })).newPage();
  await entrar(repartidor, 'repartidor', 'Reparto1234!', (url) => !url.pathname.startsWith('/login'));
  await ir(repartidor, '/entregas', 'Registrar entrega');
  await foto(repartidor, '3.6.6-mis-entregas.png', 2500);

  // HU-18: el punto de venta con un ticket armado.
  const vendedor = await (await navegador.newContext(opciones)).newPage();
  await entrar(vendedor, 'vendedor', 'Vendedor2026!', (url) => !url.pathname.startsWith('/login'));
  await ir(vendedor, '/ventas/registro', 'Punto de venta');
  // Dos productos con stock, para que la venta se pueda registrar.
  const vende = await sesion('vendedor', 'Vendedor2026!');
  const [a, b] = (await vende('GET', '/catalogo')).filter((p) => p.stockDisponible >= 3);
  const tarjeta = (p) => vendedor.locator('main button.superficie-tarjeta').filter({ hasText: p.nombre });
  await tarjeta(a).waitFor({ timeout: 60000 });
  await tarjeta(a).click();
  await tarjeta(a).click();
  await tarjeta(b).click();
  await vendedor.getByRole('button', { name: 'Para llevar' }).click();
  await foto(vendedor, '3.6.6-punto-de-venta.png');

  // HU-19: el comprobante de la venta en efectivo.
  await vendedor.getByRole('button', { name: 'Registrar venta' }).click({ timeout: 60000 });
  await vendedor.getByRole('dialog', { name: 'Comprobante' }).getByText(/V-\d{6}/).waitFor({ timeout: 60000 });
  await foto(vendedor, '3.6.6-comprobante-venta.png');

  // HU-20: la gestión de clientes.
  await vendedor.keyboard.press('Escape');
  await ir(vendedor, '/ventas/clientes', 'Clientes');
  await vendedor.getByText('Camila').first().waitFor({ timeout: 60000 });
  await foto(vendedor, '3.6.6-clientes.png');

  await navegador.close();
})().catch((e) => { console.error(e); process.exit(1); });
