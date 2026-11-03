# ms-reportes (HT-01)
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 4007
CMD ["node", "dist/server.js"]
