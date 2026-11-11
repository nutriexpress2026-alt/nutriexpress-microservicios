# Portal web (Next.js) para el servidor (HT-04). En la PC de desarrollo no hace falta:
# ahí se corre con `npm run dev` o `npx next start`.
#
# La dirección de la API se fija al compilar (NEXT_PUBLIC_API_URL viaja dentro del
# JavaScript que recibe el navegador), por eso llega como argumento de construcción.
FROM node:22-bookworm-slim AS construir
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=construir /app/.next ./.next
COPY --from=construir /app/public ./public
COPY --from=construir /app/next.config.ts ./

EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
