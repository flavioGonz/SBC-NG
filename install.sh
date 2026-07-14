#!/usr/bin/env bash
# ============================================================================
#  SBC-NG · instalador
#
#  Levanta el borde completo: Kamailio, rtpengine, la base y el control-plane.
#  No instala ninguna central: SBC-NG va DELANTE de la que ya tengas.
# ============================================================================
set -euo pipefail

azul()  { printf '\033[1;34m%s\033[0m\n' "$*"; }
verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
rojo()  { printf '\033[1;31m%s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { rojo "Corré el instalador como root."; exit 1; }
command -v docker >/dev/null || { rojo "Falta Docker."; exit 1; }

cd "$(dirname "$0")"
ENV_FILE=docker/.env

azul "── SBC-NG · instalación ──────────────────────────────────────────────"

if [ ! -f "$ENV_FILE" ]; then
  cp docker/.env.example "$ENV_FILE"

  read -rp "Dominio o IP pública del SBC (ej: sbc.tuempresa.com): " DOM
  read -rp "Rango de puertos RTP [30000-40000]: " RTP; RTP=${RTP:-30000-40000}

  DBP=$(openssl rand -hex 16)
  JWT=$(openssl rand -hex 32)
  TRN=$(openssl rand -hex 16)

  sed -i "s|^DOMAIN=.*|DOMAIN=${DOM}|"        "$ENV_FILE"
  sed -i "s|^PUBLIC_IP=.*|PUBLIC_IP=${DOM}|"  "$ENV_FILE"
  sed -i "s|^DB_PASS=.*|DB_PASS=${DBP}|"      "$ENV_FILE"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" "$ENV_FILE"
  sed -i "s|^TURN_PASS=.*|TURN_PASS=${TRN}|"  "$ENV_FILE"
  sed -i "s|^RTP_PORT_MIN=.*|RTP_PORT_MIN=${RTP%-*}|" "$ENV_FILE"
  sed -i "s|^RTP_PORT_MAX=.*|RTP_PORT_MAX=${RTP#*-}|" "$ENV_FILE"
fi

azul "Levantando el stack…"
docker compose -f docker/docker-compose.yml --env-file "$ENV_FILE" up -d --build

azul "Aplicando migraciones…"
docker compose -f docker/docker-compose.yml --env-file "$ENV_FILE" \
  run --rm -v "$PWD/db/migrations:/app/migrations" control-plane node migrate.js

verde ""
verde "SBC-NG está andando."
verde "  Panel:  http://$(hostname -I | awk '{print $1}'):3100"
verde ""
azul  "Ahora enganchá tu central (PBX-NG, 3CX, FreePBX, lo que uses):"
echo  "  curl -X POST http://localhost:3100/api/v1/attach \\"
echo  "    -H 'Authorization: Bearer <token>' \\"
echo  "    -d '{\"name\":\"Mi central\",\"sip_uri\":\"sip:192.168.1.10:5060\"}'"
echo ""
azul  "Revisá los puertos que hay que abrir en docs/FIREWALL.md"
