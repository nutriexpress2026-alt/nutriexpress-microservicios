#!/usr/bin/env node
/**
 * Poblada de NutriExpress (HT-04): productos con foto y valor nutricional,
 * insumos con su compra, una receta por producto y órdenes de producción
 * finalizadas para que haya stock.
 *
 * Todo pasa por la API del gateway, como si lo hiciera un administrador desde la
 * pantalla: así cada servicio guarda lo suyo y las réplicas viajan por eventos
 * (RNF-ARQ-02). Se puede correr varias veces: busca por nombre lo que ya existe
 * y solo compra y produce lo que falta para llegar al stock de `datos.mjs`.
 *
 * Uso:  NX_URL=http://127.0.0.1:8080/api NX_USUARIO=admin NX_CLAVE=... node poblar.mjs
 * Sin NX_CLAVE, la pide por la consola. Ver LEEME.md.
 */
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSUMOS, PRODUCTOS, NOMBRE_RECETA } from './datos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_API = (process.env.NX_URL ?? 'http://127.0.0.1:8080/api').replace(/\/$/, '');
const USUARIO = process.env.NX_USUARIO ?? 'admin';
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const hoy = new Date();
const enDias = (d) => new Date(hoy.getTime() + d * 86400000).toISOString().slice(0, 10);
const redondear = (n, unidad) => (unidad === 'u' ? Math.ceil(n) : Math.ceil(n * 10) / 10);

let token = null;

async function api(metodo, ruta, cuerpo, { reintentos = 0 } = {}) {
  for (let intento = 0; ; intento++) {
    const opciones = { method: metodo, headers: {} };
    if (token) opciones.headers.Authorization = `Bearer ${token}`;
    if (cuerpo instanceof FormData) opciones.body = cuerpo;
    else if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    const r = await fetch(URL_API + ruta, opciones);
    const texto = await r.text();
    const datos = texto ? JSON.parse(texto) : null;
    if (r.ok) return datos;
    // Una réplica que todavía no llegó (404) o un servicio que arranca (503): se espera y se reintenta.
    if (intento < reintentos && (r.status === 404 || r.status === 503 || r.status === 409)) {
      await esperar(2000);
      continue;
    }
    throw new Error(`${metodo} ${ruta} → ${r.status}: ${datos?.error ?? datos?.mensaje ?? texto}`);
  }
}

function pedirClave() {
  if (process.env.NX_CLAVE) return Promise.resolve(process.env.NX_CLAVE);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (!s.includes('\n') && !s.startsWith('Contraseña')) return; rl.output.write(s); };
  return new Promise((ok) => rl.question(`Contraseña de ${USUARIO}: `, (c) => { rl.close(); console.log(); ok(c); }));
}

const porNombre = (lista) => new Map(lista.map((x) => [x.nombre.toLowerCase(), x]));

async function main() {
  console.log(`Poblada de NutriExpress contra ${URL_API}`);
  const sesion = await api('POST', '/auth/login', { nombreUsuario: USUARIO, contrasena: await pedirClave() });
  token = sesion.token;

  // 1. Insumos (ms-inventario). Su réplica viaja a ms-catalogo para las recetas.
  const unidades = new Map((await api('GET', '/insumos/unidades')).map((u) => [u.abreviatura, u.id]));
  let insumos = porNombre(await api('GET', '/insumos?incluirInactivos=true'));
  let creados = 0;
  for (const i of INSUMOS) {
    if (insumos.has(i.nombre.toLowerCase())) continue;
    await api('POST', '/insumos', {
      nombre: i.nombre,
      idUnidad: unidades.get(i.unidad),
      stockMinimo: i.minimo,
      tipoConservacion: i.conservacion,
      controlaVencimiento: i.vence !== undefined,
    });
    creados++;
  }
  insumos = porNombre(await api('GET', '/insumos?incluirInactivos=true'));
  console.log(`Insumos: ${creados} nuevos, ${INSUMOS.length} en la lista`);

  // 2. Productos (ms-catalogo): datos, valor nutricional y foto. A los que ya
  //    existían no se les cambia el precio (puede estar puesto a propósito).
  const categorias = new Map((await api('GET', '/catalogo/categorias')).map((c) => [c.nombre, c.id]));
  for (const p of PRODUCTOS) {
    if (!categorias.has(p.categoria)) {
      throw new Error(`Falta la categoría «${p.categoria}»: créela en el sistema y vuelva a correr la poblada`);
    }
  }
  let productos = porNombre(await api('GET', '/productos?incluirInactivos=true'));
  creados = 0;
  let fotos = 0;
  for (const p of PRODUCTOS) {
    let actual = productos.get(p.nombre.toLowerCase());
    if (!actual) {
      actual = await api('POST', '/productos', {
        nombre: p.nombre,
        descripcion: p.descripcion,
        precioVenta: p.precio,
        idCategoria: categorias.get(p.categoria),
        tipoConservacion: p.conservacion,
      });
      creados++;
    } else if (!actual.descripcion) {
      await api('PUT', `/productos/${actual.id}`, { descripcion: p.descripcion });
    }
    const [calorias, proteinas, carbohidratos, grasas, fibra] = p.nutricion;
    await api('PUT', `/productos/${actual.id}/valor-nutricional`, { calorias, proteinas, carbohidratos, grasas, fibra });
    if (!actual.imagenActualizadaEn) {
      const archivo = await readFile(join(AQUI, 'fotos', p.foto));
      const formulario = new FormData();
      formulario.append('imagen', new Blob([archivo], { type: 'image/jpeg' }), p.foto);
      await api('POST', `/productos/${actual.id}/imagen`, formulario);
      fotos++;
    }
  }
  productos = porNombre(await api('GET', '/productos?incluirInactivos=true'));
  console.log(`Productos: ${creados} nuevos, ${fotos} fotos subidas, ${PRODUCTOS.length} con valor nutricional`);

  // 3. Recetas (ms-catalogo): una versión «Porción estándar» por producto, y activa.
  const recetaActiva = new Map();
  creados = 0;
  for (const p of PRODUCTOS.filter((x) => x.receta)) {
    const producto = productos.get(p.nombre.toLowerCase());
    const versiones = await api('GET', `/productos/${producto.id}/recetas`);
    let receta = versiones.find((v) => v.nombre === NOMBRE_RECETA);
    if (!receta) {
      receta = await api(
        'POST',
        `/productos/${producto.id}/recetas`,
        {
          nombre: NOMBRE_RECETA,
          rendimiento: p.receta.rendimiento,
          tiempoPreparacionMinutos: p.receta.minutos,
          instrucciones: p.receta.instrucciones,
          divisible: p.receta.divisible ?? true,
          insumos: Object.entries(p.receta.insumos).map(([nombre, cantidad]) => {
            const insumo = insumos.get(nombre.toLowerCase());
            if (!insumo) throw new Error(`La receta de ${p.nombre} usa «${nombre}», que no está en INSUMOS`);
            return { idIngrediente: insumo.id, cantidadRequerida: cantidad };
          }),
        },
        { reintentos: 15 }, // el insumo recién creado tarda unos segundos en llegar a ms-catalogo
      );
      creados++;
    }
    if (!receta.activa) receta = await api('POST', `/recetas/${receta.id}/activar`);
    recetaActiva.set(p.nombre, receta);
  }
  console.log(`Recetas: ${creados} nuevas, ${recetaActiva.size} activas`);

  // 4. Qué hay que producir y cuántos insumos hacen falta para eso.
  const plan = [];
  const necesidad = new Map();
  for (const p of PRODUCTOS.filter((x) => x.receta)) {
    const producto = productos.get(p.nombre.toLowerCase());
    const falta = p.stock - (producto.stockTotal ?? 0);
    if (falta <= 0) continue;
    const { rendimiento, divisible = true } = p.receta;
    const cantidad = divisible ? falta : Math.ceil(falta / rendimiento) * rendimiento;
    plan.push({ p, producto, cantidad, receta: recetaActiva.get(p.nombre) });
    for (const [nombre, porCorrida] of Object.entries(p.receta.insumos)) {
      necesidad.set(nombre, (necesidad.get(nombre) ?? 0) + (porCorrida * cantidad) / rendimiento);
    }
  }

  // 5. Compra de insumos (nota de ingreso, motivo Compra): lo que pide la
  //    producción más un margen para que nada quede debajo del mínimo.
  const almacenes = await api('GET', '/almacenes');
  const almacenDe = (conservacion) =>
    (almacenes.find((a) => a.tipoConservacion === conservacion && a.preferido) ??
      almacenes.find((a) => a.tipoConservacion === conservacion)).id;
  const lineas = [];
  let lote = 1;
  for (const i of INSUMOS) {
    const insumo = insumos.get(i.nombre.toLowerCase());
    const objetivo = (necesidad.get(i.nombre) ?? 0) + Math.max(i.minimo * 2, i.unidad === 'u' ? 12 : 1);
    const comprar = redondear(objetivo - insumo.stockTotal, i.unidad);
    if (comprar <= 0) continue;
    const linea = { idIngrediente: insumo.id, idAlmacen: almacenDe(i.conservacion), cantidad: comprar, costoUnitario: i.costo };
    if (insumo.controlaVencimiento) {
      linea.codigoLote = `L${hoy.toISOString().slice(2, 10).replaceAll('-', '')}-${String(lote++).padStart(2, '0')}`;
      linea.fechaVencimiento = enDias(i.vence ?? 30);
    }
    lineas.push(linea);
  }
  if (lineas.length > 0) {
    const nota = await api(
      'POST',
      '/ingresos',
      { motivo: 'Compra', proveedor: 'Mercado Rodríguez y Distribuidora Andina', numeroDocumento: `F-${Date.now() % 100000}`, insumos: lineas },
      { reintentos: 10 },
    );
    console.log(`Compra de insumos: nota ${nota.numero ?? nota.id ?? ''} con ${lineas.length} insumos`);
  } else console.log('Compra de insumos: no hacía falta');

  // 6. Productos que se compran hechos (agua, yogur bebible).
  const reventa = [];
  for (const p of PRODUCTOS.filter((x) => x.compra)) {
    const producto = productos.get(p.nombre.toLowerCase());
    const falta = p.stock - (producto.stockTotal ?? 0);
    if (falta > 0) reventa.push({ idProducto: producto.id, idAlmacen: almacenDe(p.conservacion), cantidad: falta, costoUnitario: p.compra });
  }
  if (reventa.length > 0) {
    await api('POST', '/ingresos', { motivo: 'Compra', proveedor: 'Distribuidora Andina', numeroDocumento: `F-${(Date.now() + 1) % 100000}`, productos: reventa }, { reintentos: 15 });
    console.log(`Compra de productos ya hechos: ${reventa.length}`);
  }

  // 7. Producción: crear, iniciar y finalizar cada orden. Inventario descuenta
  //    los insumos e ingresa el producto al recibir el evento OrdenFinalizada.
  for (const { p, cantidad, receta } of plan) {
    const orden = await api('POST', '/ordenes', { idReceta: receta.id, cantidad }, { reintentos: 5 });
    await api('POST', `/ordenes/${orden.id}/iniciar`);
    await api('POST', `/ordenes/${orden.id}/finalizar`, { cantidadObtenida: cantidad }, { reintentos: 3 });
    console.log(`Producción: orden ${orden.id}, ${cantidad} × ${p.nombre}`);
  }

  // 8. Esperar a que inventario registre todo y mostrar cómo quedó.
  for (let i = 0; i < 20; i++) {
    productos = porNombre(await api('GET', '/productos?incluirInactivos=true'));
    if (PRODUCTOS.every((p) => (productos.get(p.nombre.toLowerCase())?.stockTotal ?? 0) >= p.stock)) break;
    await esperar(1500);
  }
  console.log('\nStock final:');
  for (const p of PRODUCTOS) {
    const x = productos.get(p.nombre.toLowerCase());
    console.log(`  ${String(x?.stockTotal ?? 0).padStart(3)}  ${p.nombre}${x?.imagenActualizadaEn ? '' : '  (sin foto)'}`);
  }
  const alertas = await api('GET', '/stock/alertas');
  const total = Array.isArray(alertas) ? alertas.length : (alertas?.datos?.length ?? 0);
  console.log(`Alertas de stock bajo: ${total}`);
}

main().catch((e) => {
  console.error(`\nLa poblada se detuvo: ${e.message}\nSe puede volver a correr: continúa donde quedó.`);
  process.exit(1);
});
