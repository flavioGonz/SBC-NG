#!/usr/bin/env bash
# ============================================================================
#  SBC-NG · instalador
#
#  Levanta el borde completo: Kamailio, rtpengine, la base y el control-plane.
#  NO instala ninguna central: SBC-NG va DELANTE de la que ya tengas.
# ============================================================================
set -euo pipefail

azul()  { printf '\033[1;34m%s\033[0m\n' "$*"; }
verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
rojo()  { printf '\033[1;31m%s\033[0m\n' "$*"; }
gris()  { printf '\033[0;90m%s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { rojo "Corré el instalador como root."; exit 1; }
command -v docker >/dev/null || { rojo "Falta Docker."; exit 1; }
command -v openssl >/dev/null || { rojo "Falta openssl (para generar los secretos)."; exit 1; }

cd "$(dirname "$0")"
ENV_FILE=docker/.env
COMPOSE="docker compose -f docker/docker-compose.yml --env-file $ENV_FILE"

azul "── SBC-NG · instalación ─────────────────────────────────────────────────"
echo
gris "SBC-NG es el borde: se pone entre internet y tu central. Filtra ataques,"
gris "ancla los medios, hace NAT para WebRTC y rutea a los operadores."
echo

if [ ! -f "$ENV_FILE" ]; then
  cp docker/.env.example "$ENV_FILE"

  read -rp "Dominio o IP pública del SBC (ej: sbc.tuempresa.com): " DOM
  [ -n "$DOM" ] || { rojo "Sin dominio ni IP pública el SBC no puede anunciar dónde está."; exit 1; }

  read -rp "Rango de puertos RTP [30000-40000]: " RTP; RTP=${RTP:-30000-40000}
  read -rp "¿Activar el módulo TURN (WebRTC)? [S/n]: " TURN_ON; TURN_ON=${TURN_ON:-S}

  # Kamailio y rtpengine corren en modo host: el control-plane los alcanza por acá.
  HOST_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"
  [ -n "$HOST_IP" ] || HOST_IP="172.17.0.1"
  TRUSTED="$(echo "$HOST_IP" | awk -F. '{print $1"."$2"."$3".0/24"}')"

  DBP=$(openssl rand -hex 16)
  JWT=$(openssl rand -hex 32)
  TRN=$(openssl rand -hex 16)

  sed -i "s|^DOMAIN=.*|DOMAIN=${DOM}|"                  "$ENV_FILE"
  sed -i "s|^PUBLIC_IP=.*|PUBLIC_IP=${DOM}|"            "$ENV_FILE"
  sed -i "s|^HOST_IP=.*|HOST_IP=${HOST_IP}|"            "$ENV_FILE"
  sed -i "s|^TRUSTED_NET=.*|TRUSTED_NET=${TRUSTED}|"    "$ENV_FILE"
  sed -i "s|^DB_PASS=.*|DB_PASS=${DBP}|"                "$ENV_FILE"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|"          "$ENV_FILE"
  sed -i "s|^TURN_PASS=.*|TURN_PASS=${TRN}|"            "$ENV_FILE"
  sed -i "s|^RTP_PORT_MIN=.*|RTP_PORT_MIN=${RTP%-*}|"   "$ENV_FILE"
  sed -i "s|^RTP_PORT_MAX=.*|RTP_PORT_MAX=${RTP#*-}|"   "$ENV_FILE"

  case "$TURN_ON" in [Nn]*) PERFILES="" ;; *) PERFILES="--profile turn" ;; esac
  echo "COMPOSE_PROFILES=${PERFILES#--profile }" >> "$ENV_FILE"
fi

# shellcheck disable=SC1090
PERFIL=""
grep -q '^COMPOSE_PROFILES=turn' "$ENV_FILE" && PERFIL="--profile turn"

azul "Construyendo y levantando el stack (la primera vez compila rtpengine con"
azul "los códecs, así que tarda: es lo que después permite transcodificar)…"
$COMPOSE $PERFIL up -d --build

azul "Aplicando migraciones…"
$COMPOSE run --rm control-plane node migrate.js

# Usuario del panel y token de la API norte, en el primer arranque.
azul "Creando el usuario administrador y el token de la API…"
TOKEN=$(openssl rand -hex 24)
PASS=$(openssl rand -base64 12 | tr -d '/+=' | head -c 12)
$COMPOSE run --rm control-plane node -e "
const bcrypt=require('bcryptjs'), db=require('./db');
(async()=>{
  await db.esperar();
  await db.pool.query(\"INSERT INTO sbc_users (username,password,role) VALUES ('admin',\$1,'admin') ON CONFLICT (username) DO NOTHING\", [bcrypt.hashSync('${PASS}',10)]);
  await db.pool.query(\"INSERT INTO sbc_api_tokens (name,token) VALUES ('central',\$1) ON CONFLICT (token) DO NOTHING\", ['${TOKEN}']);
  process.exit(0);
})();" >/dev/null 2>&1 || true

IP="$(hostname -I | awk '{print $1}')"

verde ""
verde "════════════════════════════════════════════════════════════════════════"
verde " SBC-NG está andando."
verde "════════════════════════════════════════════════════════════════════════"
echo
echo "  Panel:            http://${IP}:3100"
echo "  Usuario:          admin"
echo "  Contraseña:       ${PASS}"
echo "  Token de la API:  ${TOKEN}"
echo
rojo  "  Anotá esa contraseña y ese token AHORA: no se vuelven a mostrar."
echo
azul  "Enganchá tu central (PBX-NG, 3CX, FreePBX, la que uses):"
echo
echo "  curl -X POST http://${IP}:3100/api/v1/attach \\"
echo "    -H 'Authorization: Bearer ${TOKEN}' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"name\":\"Mi central\",\"sip_uri\":\"sip:192.168.1.10:5060\"}'"
echo
azul  "Y abrí los puertos: docs/FIREWALL.md"
gris  "  (si abrís el 5060 pero no el rango RTP, la llamada entra y no se escucha nada)"
gris  "  TLS: por defecto lo termina el proxy. Si activás 'TLS nativo' en Certificados,"
gris  "  abrí ademas 5061/tcp (SIP/TLS) y 8443/tcp (WSS WebRTC)."
