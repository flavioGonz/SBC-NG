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
RUN apk add --no-cache iproute2 nftables tcpdump iputils traceroute openssl

COPY control-plane/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY control-plane/ ./
COPY VERSION ./VERSION
COPY db/migrations ./migrations

EXPOSE 3100
CMD ["node", "server.js"]
