/**
 * Datos iniciales de ms-identidad: permisos, roles, cargos y un usuario por
 * tipo de cuenta para probar el sistema. Es idempotente: volver a correrlo no
 * duplica nada ni pisa contraseñas que ya se hayan cambiado.
 *
 * Usuarios: admin / Admin1234! (todos los permisos) · repartidor / Reparto1234!
 * · vendedor / Vendedor2026! · cocinero / Cocinero2026! · almacenero / Almacen2026!
 * · cliente / Cliente2026!
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { pathToFileURL } from 'node:url';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * Catálogo de permisos de todo el sistema (RF-SEG-06). Vive aquí porque el
 * permiso es de identidad, aunque lo use otro servicio: ms-identidad lo pone en
 * el token y cada servicio solo comprueba que esté.
 */
const PERMISOS = [
  // Administración y seguridad (ms-identidad)
  'USUARIO_LEER', 'USUARIO_CREAR', 'USUARIO_EDITAR', 'USUARIO_BAJA',
  'ROL_LEER', 'ROL_GESTIONAR', 'PERMISO_ASIGNAR', 'CONFIGURACION_GESTIONAR',
  // Ventas (ms-ventas)
  'VENTA_REGISTRAR', 'VENTA_LEER', 'CLIENTE_GESTIONAR',
  // Pedidos (ms-pedidos)
  'PEDIDO_GESTIONAR', 'PEDIDO_LEER', 'PEDIDO_CERRAR_AJENO',
  // Catálogo y producción (ms-catalogo)
  'PRODUCTO_GESTIONAR', 'ORDEN_PRODUCCION_GESTIONAR',
  // Inventario (ms-inventario)
  'INSUMO_GESTIONAR', 'ALMACEN_GESTIONAR', 'INGRESO_REGISTRAR',
  'EGRESO_REGISTRAR', 'STOCK_CONSULTAR',
];

/** Permisos de cada rol (al menos dos roles de acceso, RF-SEG-06). */
const PERMISOS_POR_ROL: Record<string, string[]> = {
  Administrador: PERMISOS,
  Empleado: [
    'VENTA_REGISTRAR', 'VENTA_LEER', 'CLIENTE_GESTIONAR',
    'PEDIDO_GESTIONAR', 'PEDIDO_LEER',
    'PRODUCTO_GESTIONAR', 'ORDEN_PRODUCCION_GESTIONAR',
    'INSUMO_GESTIONAR', 'INGRESO_REGISTRAR', 'EGRESO_REGISTRAR', 'STOCK_CONSULTAR',
  ],
  Cliente: ['PEDIDO_GESTIONAR', 'PEDIDO_LEER'],
};

const CARGOS = ['Administrador', 'Vendedor', 'Cocinero', 'Almacenero', 'Repartidor'];

interface CuentaDePrueba {
  usuario: string;
  nombre: string;
  apellido: string;
  email: string;
  clave: string;
  rol: 'Administrador' | 'Empleado' | 'Cliente';
  cargo: string | null;
}

const CUENTAS: CuentaDePrueba[] = [
  { usuario: 'admin', nombre: 'Nilser Rodrigo', apellido: 'Condori Ortiz', email: 'admin@nutriexpress.bo', clave: 'Admin1234!', rol: 'Administrador', cargo: 'Administrador' },
  { usuario: 'repartidor', nombre: 'Marcos', apellido: 'Vargas', email: 'reparto@nutriexpress.bo', clave: 'Reparto1234!', rol: 'Empleado', cargo: 'Repartidor' },
  { usuario: 'vendedor', nombre: 'Valeria', apellido: 'Ventas', email: 'vendedor@nutriexpress.bo', clave: 'Vendedor2026!', rol: 'Empleado', cargo: 'Vendedor' },
  { usuario: 'cocinero', nombre: 'Carlos', apellido: 'Cocina', email: 'cocinero@nutriexpress.bo', clave: 'Cocinero2026!', rol: 'Empleado', cargo: 'Cocinero' },
  { usuario: 'almacenero', nombre: 'Ana', apellido: 'Almacén', email: 'almacenero@nutriexpress.bo', clave: 'Almacen2026!', rol: 'Empleado', cargo: 'Almacenero' },
  { usuario: 'cliente', nombre: 'Camila', apellido: 'Cliente', email: 'cliente@nutriexpress.bo', clave: 'Cliente2026!', rol: 'Cliente', cargo: null },
];

async function crearCuenta(c: CuentaDePrueba) {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { nombre: c.rol } });
  const usuario = await prisma.usuario.upsert({
    where: { nombre_usuario: c.usuario },
    update: {},
    create: {
      nombre: c.nombre,
      apellido: c.apellido,
      email: c.email,
      nombre_usuario: c.usuario,
      contrasena_hash: await bcrypt.hash(c.clave, Number(process.env.BCRYPT_ROUNDS ?? 10)),
      id_rol: rol.id_rol,
    },
  });

  // Subtipo: las cuentas son empleado (con su cargo) o cliente, nunca ninguna.
  if (c.cargo) {
    const cargo = await prisma.cargo.findUniqueOrThrow({ where: { nombre: c.cargo } });
    await prisma.empleado.upsert({
      where: { id_empleado: usuario.id_usuario },
      update: {},
      create: { id_empleado: usuario.id_usuario, id_cargo: cargo.id_cargo },
    });
  } else {
    await prisma.cliente.upsert({
      where: { id_cliente: usuario.id_usuario },
      update: {},
      create: { id_cliente: usuario.id_usuario },
    });
  }

  // Cada cuenta nace con todos los permisos de su rol (RF-SEG-07).
  const delRol = await prisma.rol_permiso.findMany({ where: { id_rol: rol.id_rol } });
  for (const rp of delRol) {
    await prisma.usuario_rol_permiso.upsert({
      where: {
        id_usuario_id_rol_permiso: { id_usuario: usuario.id_usuario, id_rol_permiso: rp.id_rol_permiso },
      },
      update: {},
      create: { id_usuario: usuario.id_usuario, id_rol_permiso: rp.id_rol_permiso },
    });
  }
}

export async function main() {
  for (const nombre of PERMISOS) {
    await prisma.permiso.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
  const idPermiso = new Map((await prisma.permiso.findMany()).map((p) => [p.nombre, p.id_permiso]));

  for (const [nombreRol, nombres] of Object.entries(PERMISOS_POR_ROL)) {
    const rol = await prisma.rol.upsert({ where: { nombre: nombreRol }, update: {}, create: { nombre: nombreRol } });
    for (const np of nombres) {
      await prisma.rol_permiso.upsert({
        where: { id_rol_id_permiso: { id_rol: rol.id_rol, id_permiso: idPermiso.get(np)! } },
        update: {},
        create: { id_rol: rol.id_rol, id_permiso: idPermiso.get(np)! },
      });
    }
  }

  for (const nombre of CARGOS) {
    await prisma.cargo.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }

  for (const cuenta of CUENTAS) await crearCuenta(cuenta);

  console.log(`ms-identidad: ${PERMISOS.length} permisos, ${Object.keys(PERMISOS_POR_ROL).length} roles, ${CUENTAS.length} cuentas de prueba`);
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export { prisma as prismaSemilla };
