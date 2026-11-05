# ms-pagos (HU-26, HU-27).
FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

EXPOSE 4005
# Crea las tablas y los datos iniciales si la base está vacía, y arranca.
CMD ["sh", "-c", "npx tsx prisma/inicializar.ts && node dist/server.js"]
