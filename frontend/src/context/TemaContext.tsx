'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { leerSesion } from '@/lib/sesion';
import {
  CLAVE_MODO,
  CLAVE_TEMA,
  modoSegunLaHora,
  TEMA_POR_OMISION,
  type Modo,
  type PreferenciaModo,
  type Tema,
} from '@/lib/tema';

export type { Modo, PreferenciaModo, Tema };

interface ContextoTema {
  tema: Tema;
  preferencia: PreferenciaModo;
  /** Modo realmente aplicado; con `auto` lo decide la hora del cliente. */
  modo: Modo;
  /**
   * Con sesión iniciada, la elección también se guarda en la cuenta (HU-33): se
   * recuerda en cualquier dispositivo. `enLaCuenta: false` la aplica solo aquí
   * (es lo que hace el inicio de sesión al traer la de la cuenta).
   */
  cambiarTema: (tema: Tema, opciones?: { enLaCuenta?: boolean }) => void;
  cambiarPreferencia: (preferencia: PreferenciaModo, opciones?: { enLaCuenta?: boolean }) => void;
}

/** HU-33 · Guarda la elección en la cuenta. Si falla, vale igual en este navegador. */
function guardarEnLaCuenta(datos: { tema?: Tema; modo?: PreferenciaModo }) {
  if (!leerSesion()?.token) return;
  api.put('/perfil/apariencia', datos).catch(() => {});
}

const Contexto = createContext<ContextoTema | null>(null);

/**
 * RF-WEB-02 — "El sitio debe ofrecer al menos tres temas visuales
 * seleccionables (niños, jóvenes, adultos) y aplicar automáticamente el modo
 * día o noche según el horario del cliente."
 *
 * Son dos ejes distintos y por eso se guardan por separado: el tema es siempre
 * una elección explícita, mientras que el modo admite además el valor `auto`,
 * que es el comportamiento que pide el requisito. Elegir día o noche a mano
 * desactiva la automática, porque una preferencia expresa debe ganarle a una
 * inferencia.
 *
 * Ambos valores se aplican como atributos en `<html>`, donde el CSS redefine
 * los tokens del sistema de diseño —paleta, letra, esquinas, sombras—. Ningún
 * componente conoce el tema activo. `SCRIPT_TEMA_INICIAL` (`lib/tema.ts`) los
 * aplica ya antes de pintar; este contexto los mantiene al día después.
 */
export function TemaProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTema] = useState<Tema>(TEMA_POR_OMISION);
  const [preferencia, setPreferencia] = useState<PreferenciaModo>('auto');
  const [modo, setModo] = useState<Modo>('noche');

  // Restaura la elección guardada antes de la primera pintura útil.
  useEffect(() => {
    try {
      const temaGuardado = localStorage.getItem(CLAVE_TEMA) as Tema | null;
      const modoGuardado = localStorage.getItem(CLAVE_MODO) as PreferenciaModo | null;
      if (temaGuardado) setTema(temaGuardado);
      if (modoGuardado) setPreferencia(modoGuardado);
    } catch {
      // Sin almacenamiento se usan los valores por omisión.
    }
  }, []);

  /**
   * Con `auto`, el modo se recalcula cada minuto: una sesión abierta al
   * anochecer debe cambiar sola, que es lo que el requisito describe.
   */
  useEffect(() => {
    if (preferencia !== 'auto') {
      setModo(preferencia);
      return;
    }

    setModo(modoSegunLaHora());
    const reloj = setInterval(() => setModo(modoSegunLaHora()), 60_000);
    return () => clearInterval(reloj);
  }, [preferencia]);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    document.documentElement.dataset.modo = modo;
  }, [tema, modo]);

  const cambiarTema = useCallback((nuevo: Tema, opciones?: { enLaCuenta?: boolean }) => {
    setTema(nuevo);
    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // La elección seguirá activa en esta sesión aunque no se pueda guardar.
    }
    if (opciones?.enLaCuenta !== false) guardarEnLaCuenta({ tema: nuevo });
  }, []);

  const cambiarPreferencia = useCallback((nueva: PreferenciaModo, opciones?: { enLaCuenta?: boolean }) => {
    setPreferencia(nueva);
    try {
      localStorage.setItem(CLAVE_MODO, nueva);
    } catch {
      // Idem.
    }
    if (opciones?.enLaCuenta !== false) guardarEnLaCuenta({ modo: nueva });
  }, []);

  const valor = useMemo(
    () => ({ tema, preferencia, modo, cambiarTema, cambiarPreferencia }),
    [tema, preferencia, modo, cambiarTema, cambiarPreferencia],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTema(): ContextoTema {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useTema debe usarse dentro de TemaProvider');
  return contexto;
}
