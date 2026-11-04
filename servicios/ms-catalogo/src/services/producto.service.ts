import * as productoModel from '../models/producto.model.js';
import type { ProductoGestion } from '../models/producto.model.js';
import type {
  DatosActualizarProducto,
  DatosCrearProducto,
  DatosValorNutricional,
  FiltroProductosDTO,
  ProductoGestionDTO,
} from '../dtos/producto.dto.js';
import type { ValorNutricionalDTO } from '../dtos/comun.dto.js';
import { ErrorApp } from '../errors/error-app.js';
import type { TipoConservacion } from '../config/dominio.js';
import { tipoRealDeImagen } from '../utils/imagen.js';
import * as inventario from '../clientes/inventario.js';
import { avisar } from './aviso.service.js';

/**
 * CU-PRO-01 — Gestionar Producto y Receta (parte de producto), y
 * CU-PRO-03 — Registrar Valor Nutricional, que lo extiende y es opcional.
 */

function aValorNutricional(
  valor: ProductoGestion['valor_nutricional'],
): ValorNutricionalDTO | null {
  if (!valor) return null;
  return {
    calorias: valor.calorias,
    proteinas: Number(valor.proteinas_g),
    carbohidratos: Number(valor.carbohidratos_g),
    grasas: Number(valor.grasas_g),
    fibra: valor.fibra_g === null ? null : Number(valor.fibra_g),
  };
}

/** Las existencias por almacén las informa ms-inventario (RNF-ARQ-02). */
function aDTO(
  producto: ProductoGestion,
  stocks: Map<number, inventario.ExistenciasProducto> | null,
): ProductoGestionDTO {
  const existencias = stocks?.get(producto.id_producto)?.existencias ?? [];

  return {
    id: producto.id_producto,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    precio: Number(producto.precio_venta),
    activo: producto.activo,
    tipoConservacion: producto.tipo_conservacion as TipoConservacion,
    categoria: { id: producto.categoria.id_categoria, nombre: producto.categoria.nombre },
    valorNutricional: aValorNutricional(producto.valor_nutricional),
    stockTotal: existencias.reduce((total, e) => total + e.stock, 0),
    existencias,
    // El listado no los calcula: sería una consulta por producto para un dato
    // que solo se mira en la ficha. `conCosto` los completa allí.
    costoPromedio: null,
    vendeBajoCosto: false,
    imagenActualizadaEn: producto.imagen_actualizada_en?.toISOString() ?? null,
  };
}

/**
 * Completa el costo promedio del producto.
 *
 * Se aplica solo en la ficha individual. Hacerlo también en el listado
 * costaría una consulta por producto para un dato que ahí no se muestra.
 */
async function conCosto(dto: ProductoGestionDTO): Promise<ProductoGestionDTO> {
  const costo = (await inventario.existencias([dto.id]))?.get(dto.id)?.costoPromedio ?? null;
  return {
    ...dto,
    costoPromedio: costo,
    vendeBajoCosto: costo !== null && dto.precio < costo,
  };
}

async function exigirProducto(id: number): Promise<ProductoGestion> {
  const producto = await productoModel.buscarParaGestion(id);
  if (!producto) throw new ErrorApp(404, 'El producto no existe');
  return producto;
}

/** CU-PRO-01, precondición: deben existir categorías previamente registradas. */
async function exigirCategoria(idCategoria: number): Promise<void> {
  const categoria = await productoModel.buscarCategoria(idCategoria);
  if (!categoria) throw new ErrorApp(404, 'La categoría indicada no existe');
}

export async function listar(filtro: FiltroProductosDTO): Promise<ProductoGestionDTO[]> {
  const productos = await productoModel.listarParaGestion({
    termino: filtro.termino,
    idCategoria: filtro.categoria,
    incluirInactivos: filtro.incluirInactivos,
  });
  const stocks = await inventario.existencias(productos.map((p) => p.id_producto));
  return productos.map((p) => aDTO(p, stocks));
}

async function conExistencias(producto: ProductoGestion): Promise<ProductoGestionDTO> {
  return aDTO(producto, await inventario.existencias([producto.id_producto]));
}

/**
 * Mantiene al día la réplica del producto en ms-inventario (HT-03, T2.2): se le
 * avisa con el evento ProductoGuardado. Si RabbitMQ no responde, inventario se
 * pone al día igual al arrancar, con la lista completa de /interno/productos.
 */
async function replicar(producto: ProductoGestion): Promise<void> {
  await avisar('ProductoGuardado', {
    id: producto.id_producto,
    nombre: producto.nombre,
    tipoConservacion: producto.tipo_conservacion,
    activo: producto.activo,
  });
}

export async function obtener(id: number): Promise<ProductoGestionDTO> {
  return conCosto(await conExistencias(await exigirProducto(id)));
}

export async function crear(datos: DatosCrearProducto): Promise<ProductoGestionDTO> {
  await exigirCategoria(datos.idCategoria);
  const creado = await productoModel.crear({
    nombre: datos.nombre,
    descripcion: datos.descripcion ?? null,
    precioVenta: datos.precioVenta,
    idCategoria: datos.idCategoria,
    tipoConservacion: datos.tipoConservacion,
  });
  const producto = await exigirProducto(creado.id_producto);
  await replicar(producto);
  return conExistencias(producto);
}

export async function actualizar(
  id: number,
  datos: DatosActualizarProducto,
): Promise<ProductoGestionDTO> {
  await exigirProducto(id);
  if (datos.idCategoria !== undefined) await exigirCategoria(datos.idCategoria);
  await productoModel.actualizar(id, datos);
  const producto = await exigirProducto(id);
  await replicar(producto);
  return conExistencias(producto);
}

/**
 * HU-08 (CU-PRO-01, excepciones): un producto con existencias o movimientos de
 * inventario no se elimina; se ofrece darlo de baja. Lo decide ms-inventario,
 * dueño de esos datos: si acepta, quita su réplica y aquí se borra el producto.
 * (Las ventas, los pedidos y las recetas se suman cuando existan sus servicios.)
 */
export async function eliminar(id: number): Promise<void> {
  await exigirProducto(id);
  await inventario.quitarProducto(id);
  await productoModel.eliminar(id);
}

/**
 * CU-PRO-03 — Registrar Valor Nutricional.
 *
 * Es una extensión: el producto existe con o sin ella, y puede registrarse en
 * el momento del alta o mucho después. Por eso es una operación aparte y no un
 * campo obligatorio del producto.
 */
export async function guardarValorNutricional(
  idProducto: number,
  datos: DatosValorNutricional,
): Promise<ProductoGestionDTO> {
  await exigirProducto(idProducto);
  await productoModel.guardarValorNutricional(idProducto, {
    calorias: datos.calorias,
    proteinas: datos.proteinas,
    carbohidratos: datos.carbohidratos,
    grasas: datos.grasas,
    fibra: datos.fibra ?? null,
  });
  return conExistencias(await exigirProducto(idProducto));
}

/**
 * Guarda la foto de un producto (RF-PRO extensión opcional, como el valor
 * nutricional: el producto existe con o sin ella).
 *
 * El tipo que se guarda es el que devuelve `tipoRealDeImagen`, mirando los
 * primeros bytes del archivo — nunca el `mimetype` que declaró quien lo
 * subió, que es un dato del cliente y no una verdad del servidor.
 */
export async function guardarImagen(id: number, datos: Buffer): Promise<ProductoGestionDTO> {
  await exigirProducto(id);

  const tipo = tipoRealDeImagen(datos);
  if (!tipo) {
    throw new ErrorApp(
      415,
      'El archivo no es una imagen JPEG, PNG o WEBP válida.',
    );
  }

  await productoModel.guardarImagen(id, datos, tipo);
  return conExistencias(await exigirProducto(id));
}

export async function eliminarImagen(id: number): Promise<ProductoGestionDTO> {
  await exigirProducto(id);
  await productoModel.eliminarImagen(id);
  return conExistencias(await exigirProducto(id));
}
