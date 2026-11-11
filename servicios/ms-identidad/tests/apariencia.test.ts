import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { registrarCliente } from './ayudantes.js';

/** HU-33 · «La elección se recuerda»: el tema y el modo viajan con la cuenta. */
const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('HU-33 · Apariencia de la cuenta', () => {
  it('sin elegir nada, el perfil no impone tema ni modo', async () => {
    const { token } = await registrarCliente();
    const r = await request(app).get('/api/perfil').set(cabecera(token)).expect(200);
    expect(r.body.apariencia).toEqual({ tema: null, modo: null });
  });

  it('se guarda y vuelve al iniciar sesión en otro dispositivo', async () => {
    const { token, nombreUsuario } = await registrarCliente();
    await request(app).put('/api/perfil/apariencia').set(cabecera(token)).send({ tema: 'ninos' }).expect(200);
    const r = await request(app).put('/api/perfil/apariencia').set(cabecera(token)).send({ modo: 'auto' }).expect(200);
    expect(r.body.apariencia).toEqual({ tema: 'ninos', modo: 'auto' });

    const sesion = await request(app).post('/api/auth/login').send({ nombreUsuario, contrasena: 'Cliente1234!' }).expect(200);
    expect(sesion.body.usuario.apariencia).toEqual({ tema: 'ninos', modo: 'auto' });
  });

  it('solo admite los tres temas y los modos día, noche o automático', async () => {
    const { token } = await registrarCliente();
    await request(app).put('/api/perfil/apariencia').set(cabecera(token)).send({ tema: 'oscuro' }).expect(400);
    await request(app).put('/api/perfil/apariencia').set(cabecera(token)).send({}).expect(400);
    await request(app).put('/api/perfil/apariencia').send({ tema: 'adultos' }).expect(401);
  });
});
