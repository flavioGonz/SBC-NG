# SBC-NG · panel (Next.js standalone)
#
# Build multi-etapa: la imagen final NO lleva node_modules de desarrollo ni el
# código fuente, sólo el bundle standalone que produce Next. Pesa ~120 MB en vez
# de ~700 MB, que en un appliance on-prem que se distribuye como tarball importa.
FROM node:20-alpine AS build
WORKDIR /app
# boneyard-js (los skeletons) arrastra playwright: lo usa para fotografiar el layout en
# tiempo de build, no en runtime. Sin esta variable, npm install se pone a bajar Chromium
# entero adentro de la imagen — 300 MB que no usamos para nada.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY dashboard/package.json ./
RUN npm install --no-audit --no-fund
COPY dashboard/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3001
CMD ["node", "server.js"]
