import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';

/**
 * HU-13 · Puede haber varios almacenes del mismo tipo de conservación, pero solo
 * uno *preferido* por tipo (índice parcial ux_almacen_preferido ... WHERE preferido).
 */
afterAll(async () => {
  await prisma.$disconnect();
});

const nombre = () => `Almacén de prueba ${Math.random().toString(36).slice(2, 8)}`;

describe('HU-13 · Almacén preferido por tipo de conservación', () => {
  it('admite un segundo almacén del mismo tipo', async () => {
    await prisma.almacen.create({ data: { nombre: nombre(), tipo_conservacion: 'Seco' } });
    await expect(prisma.almacen.create({ data: { nombre: nombre(), tipo_conservacion: 'Seco' } })).resolves.toBeTruthy();
  });

  it('no admite dos preferidos del mismo tipo', async () => {
    await prisma.almacen.updateMany({ where: { tipo_conservacion: 'Refrigerado' }, data: { preferido: false } });
    await prisma.almacen.create({ data: { nombre: nombre(), tipo_conservacion: 'Refrigerado', preferido: true } });
    await expect(
      prisma.almacen.create({ data: { nombre: nombre(), tipo_conservacion: 'Refrigerado', preferido: true } }),
    ).rejects.toThrow();
  });
});
