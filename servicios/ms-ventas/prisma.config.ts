import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Al construir la imagen no hay base: `prisma generate` no la necesita.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/ventas_db',
  },
});
