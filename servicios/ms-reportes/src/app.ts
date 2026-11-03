import express from 'express';
import helmet from 'helmet';
import rutas from './routes/index.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/error.middleware.js';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use('/api', rutas);
app.use(rutaNoEncontrada);
app.use(manejadorErrores);
