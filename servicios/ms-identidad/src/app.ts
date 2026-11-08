import express from 'express';
import helmet from 'helmet';
import rutas from './routes/index.js';
import interno from './routes/interno.routes.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/error.middleware.js';

export const app = express();

// Detrás del API Gateway: la IP real del cliente llega en X-Forwarded-For y es
// la que usa el límite de intentos por IP.
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
// CORS lo resuelve el API Gateway para todos los servicios (gateway/nginx.conf).
app.use(express.json({ limit: '256kb' }));

app.use('/api', rutas);
app.use('/interno', interno);

app.use(rutaNoEncontrada);
app.use(manejadorErrores);
