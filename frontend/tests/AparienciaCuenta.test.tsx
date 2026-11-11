import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/lib/api';
import { SelectorTema } from '@/components/ui/SelectorTema';
import { TemaProvider } from '@/context/TemaContext';

vi.mock('@/lib/api', () => ({
  api: { put: vi.fn(() => Promise.resolve({})) },
  ErrorApi: class ErrorApi extends Error {},
}));

/** HU-33 · «La elección se recuerda»: con sesión iniciada, también en la cuenta. */
function montar() {
  return render(
    <TemaProvider>
      <SelectorTema />
    </TemaProvider>,
  );
}

describe('Apariencia guardada en la cuenta (HU-33)', () => {
  beforeEach(() => vi.mocked(api.put).mockClear());
  afterEach(() => localStorage.clear());

  it('con sesión, el tema y el modo elegidos se guardan en la cuenta', async () => {
    localStorage.setItem('nutriexpress.sesion', JSON.stringify({ token: 'x', usuario: { id: 6 }, permisos: [] }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole('button', { name: /apariencia/i }));
    await usuario.click(screen.getByText('Adultos'));
    await usuario.click(screen.getByText('Noche'));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/perfil/apariencia', { tema: 'adultos' }));
    expect(api.put).toHaveBeenCalledWith('/perfil/apariencia', { modo: 'noche' });
    expect(localStorage.getItem('nutriexpress.tema')).toBe('adultos');
  });

  it('sin sesión (un visitante del portal) se recuerda solo en el navegador', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole('button', { name: /apariencia/i }));
    await usuario.click(screen.getByText('Niños'));

    await waitFor(() => expect(localStorage.getItem('nutriexpress.tema')).toBe('ninos'));
    expect(api.put).not.toHaveBeenCalled();
  });
});
