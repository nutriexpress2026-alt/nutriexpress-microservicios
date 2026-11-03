import express from 'express';
import helmet from 'helmet';
import rutas from './routes/index.js';
import interno from './routes/interno.routes.js';
import { alAutenticar } from './middlewares/auth.middleware.js';
import * as empleadoModel from './models/empleado.model.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/error.middleware.js';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '256kb' }));

// Réplica del empleado: con cada sesión de alguien con cargo se guarda su id y
// su nombre, para mostrar quién registró cada nota (RNF-ARQ-02).
alAutenticar.push(async (s) => {
  if (s.cargo) await empleadoModel.guardar(s.idUsuario, s.nombre, s.apellido);
});

app.use('/api', rutas);
app.use('/interno', interno);

app.use(rutaNoEncontrada);
app.use(manejadorErrores);
