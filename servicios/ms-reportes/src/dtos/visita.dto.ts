import { z } from 'zod';

/** La ruta de la página, tal como la ve el navegador: "/portal", "/inicio". */
export const esquemaRuta = z.object({
  ruta: z.string().trim().min(1).max(200).startsWith('/'),
});

export interface ContadorVisitasDTO {
  ruta: string;
  total: number;
  /** Desde cuándo se cuentan las visitas de esa página. */
  desde: string | null;
}
