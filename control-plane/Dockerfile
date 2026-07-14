# SBC-NG · control-plane
#
# El contexto de build es la RAÍZ del repo (no esta carpeta): Docker no deja
# hacer COPY de algo que esté fuera del contexto, y necesitamos VERSION y las
# migraciones. Por eso el compose usa `context: ..` con este dockerfile.
FROM node:20-alpine
WORKDIR /app

COPY control-plane/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY control-plane/ ./
COPY VERSION ./VERSION
COPY db/migrations ./migrations

EXPOSE 3100
CMD ["node", "server.js"]
