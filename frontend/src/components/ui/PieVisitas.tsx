'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye } from 'lucide-react';
import { api } from '@/lib/api';

interface Contador {
  ruta: string;
  total: number;
  desde: string | null;
}

const CLAVE_SESION = 'nutriexpress.visita-registrada:';

/**
 * RF-WEB-03 / HU-31 — "Cada página muestra en su pie el número de visitas de
 * esa página." El contador vive en ms-reportes (MongoDB), un documento por ruta.
 *
 * Cada página suma **una visita por sesión de navegador**: volver a la misma
 * pantalla dentro de la sesión solo consulta. Sin esa regla, en una aplicación
 * de una sola página cada ida y vuelta inflaría el número.
 */
export function PieVisitas() {
  const ruta = usePathname() || '/';
  const [contador, setContador] = useState<Contador | null>(null);

  useEffect(() => {
    let vigente = true;

    async function contabilizar() {
      try {
        const clave = CLAVE_SESION + ruta;
        let yaRegistrada = false;
        try {
          yaRegistrada = sessionStorage.getItem(clave) === '1';
        } catch {
          // Sin sessionStorage se consulta sin registrar, para no inflar el total.
          yaRegistrada = true;
        }

        const datos = yaRegistrada
          ? await api.get<Contador>(`/visitas?ruta=${encodeURIComponent(ruta)}`)
          : await api.post<Contador>('/visitas', { ruta });

        if (!yaRegistrada) {
          try {
            sessionStorage.setItem(clave, '1');
          } catch {
            // El registro ya ocurrió en el servidor; no reintentar es lo correcto.
          }
        }

        if (vigente) setContador(datos);
      } catch {
        // El contador es informativo: si la API no responde, el pie se omite.
      }
    }

    void contabilizar();
    return () => {
      vigente = false;
    };
  }, [ruta]);

  if (!contador) return null;

  const anio = contador.desde ? new Date(contador.desde).getFullYear() : null;

  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex items-center justify-center gap-1.5 text-[11px] text-tinta-tenue"
    >
      <Eye className="size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="tabular-nums text-tinta-suave">
          {contador.total.toLocaleString('es-BO')}
        </span>{' '}
        {contador.total === 1 ? 'visita a esta página' : 'visitas a esta página'}
        {anio && ` desde ${anio}`}
      </span>
    </motion.p>
  );
}
