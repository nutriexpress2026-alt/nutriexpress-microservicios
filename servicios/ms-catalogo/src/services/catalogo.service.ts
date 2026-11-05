import * as productoModel from '../models/producto.model.js';
import type { ProductoPublico } from '../models/producto.model.js';
import type {
  CategoriaDTO,
  ParametrosBusqueda,
  ProductoDTO,
  ValorNutricionalDTO,
} from '../dtos/catalogo.dto.js';
import { ErrorApp } from '../errors/error-app.js';
import * as inventario from '../clientes/inventario.js';

/**
 * CU-PED-01 — Buscar Productos.
 *
 * El caso de uso puede ejecutarse sin haber iniciado sesión, por lo que este
 * servicio nunca recibe la sesión ni consulta permisos.
 */

function aValorNutricional(
  valor: ProductoPublico['valor_nutricional'],
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

/**
 * El stock lo informa ms-inventario. Si no responde, el catálogo se muestra
 * igual, con los productos sin existencias (RNF-DIS-01).
 */
function aDTO(producto: ProductoPublico, stocks: Map<number, inventario.ExistenciasProducto> | null): ProductoDTO {
  // Lo disponible: el stock menos lo reservado para pedidos que esperan (HU-21).
  const e = stocks?.get(producto.id_producto);
  const stock = Math.max(0, (e?.stockTotal ?? 0) - (e?.reservado ?? 0));
  return {
    id: producto.id_producto,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    precio: Number(producto.precio_venta),
    categoria: {
      id: producto.categoria.id_categoria,
      nombre: producto.categoria.nombre,
    },
    stockDisponible: stock,
    disponible: stock > 0,
    valorNutricional: aValorNutricional(producto.valor_nutricional),
    imagenActualizadaEn: producto.imagen_actualizada_en?.toISOString() ?? null,
  };
}

export async function buscar(parametros: ParametrosBusqueda): Promise<ProductoDTO[]> {
  const productos = await productoModel.buscarActivos({
    termino: parametros.termino,
    idCategoria: parametros.categoria,
  });
  const stocks = await inventario.existencias(productos.map((p) => p.id_producto));
  return productos.map((p) => aDTO(p, stocks));
}

export async function detalle(id: number): Promise<ProductoDTO> {
  const producto = await productoModel.buscarActivoPorId(id);
  if (!producto) throw new ErrorApp(404, 'El producto no existe o no está disponible');
  return aDTO(producto, await inventario.existencias([id]));
}

export async function listarCategorias(): Promise<CategoriaDTO[]> {
  const categorias = await productoModel.listarCategorias();
  return categorias.map((c) => ({ id: c.id_categoria, nombre: c.nombre }));
}

export interface ImagenProducto {
  datos: Buffer;
  tipo: string;
}

/**
 * La foto de un producto, para el único extremo que la sirve en bytes
 * (`GET /catalogo/:id/imagen`).
 *
 * A propósito no filtra por `activo`: una fotografía no es información de
 * negocio como la receta o el costo, y el mismo extremo lo usa también el
 * panel de gestión para mostrar la ficha de un producto dado de baja, sin
 * necesitar una segunda ruta protegida que sirva lo mismo.
 */
export async function obtenerImagen(id: number): Promise<ImagenProducto | null> {
  const producto = await productoModel.buscarImagen(id);
  if (!producto?.imagen || !producto.imagen_tipo) return null;
  return { datos: Buffer.from(producto.imagen), tipo: producto.imagen_tipo };
}
