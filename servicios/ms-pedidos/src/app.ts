import express from 'express';
import helmet from 'helmet';
import rutas from './routes/index.js';
import gestion from './routes/gestion.routes.js';
import interno from './routes/interno.routes.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/error.middleware.js';
import { alAutenticar } from './middlewares/auth.middleware.js';
import { exigirSesionVigente } from './middlewares/sesiones-vigentes.js';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '256kb' }));

// HU-05: un token anterior a un cambio de permisos de su usuario o rol ya no sirve.
alAutenticar.unshift(exigirSesionVigente);

// HU-23, HU-24 (Sprint 5): el lado del personal.
app.use('/api/gestion', gestion);
app.use('/api', rutas);
app.use('/interno', interno);

app.use(rutaNoEncontrada);
app.use(manejadorErrores);
