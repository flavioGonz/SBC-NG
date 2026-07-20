# SBC-NG · control-plane
#
# El contexto de build es la RAÍZ del repo (no esta carpeta): Docker no deja
# hacer COPY de algo que esté fuera del contexto, y necesitamos VERSION y las
# migraciones. Por eso el compose usa `context: ..` con este dockerfile.
FROM node:20-alpine
WORKDIR /app

# iproute2: el panel lee las rutas del SBC con `ip route` (las interfaces salen de /sys).
# tcpdump: la captura SIP (el "SIP debug"). El contenedor corre en modo host y con
# NET_RAW, asi que ve el trafico real del SBC con las IPs de verdad — no el veth de docker.
# iputils + traceroute: el diagnostico de red del panel (ping y traceroute desde el SBC).
# postgresql17-client: pg_dump/psql para el respaldo. La version del cliente va POR
# ENCIMA de la del motor (hoy 16) a proposito: pg_dump se niega a volcar un servidor
# mas nuevo que el, y al reves funciona sin problema. Si el motor sube de la 17, hay
# que subir esto tambien.
RUN apk add --no-cache iproute2 nftables tcpdump iputils traceroute openssl postgresql17-client

COPY control-plane/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY control-plane/ ./
COPY VERSION ./VERSION
COPY db/migrations ./migrations

EXPOSE 3100
CMD ["node", "server.js"]
