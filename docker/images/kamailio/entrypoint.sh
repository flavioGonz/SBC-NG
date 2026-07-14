#!/usr/bin/env bash
# ============================================================================
#  SBC-NG · entrypoint de Kamailio
#
#  Resuelve los @@TOKENS@@ desde el entorno (sed dirigido: NO toca las variables
#  $ propias de Kamailio), espera la base y arranca.
#
#  Ojo con lo que YA NO pide: ASTERISK_HOST. El SBC no tiene una central
#  cableada: las centrales entran por la API (attach) a la tabla dispatcher.
# ============================================================================
set -e

: "${DB_HOST:=postgres}"; : "${DB_PORT:=5432}"; : "${DB_NAME:=sbcng}"
: "${DB_USER:=sbcng}";    : "${DB_PASS:?DB_PASS es obligatorio}"

SELF_IP="${SELF_IP:-$(hostname -I | awk '{print $1}')}"
: "${PUBLIC_IP:=$SELF_IP}"

# Si PUBLIC_IP es un nombre (IP dinámica con DDNS), lo resolvemos: Kamailio necesita
# una IP literal para anunciar en Via y Record-Route.
case "$PUBLIC_IP" in
  *[a-zA-Z]*)
    RES="$(getent hosts "$PUBLIC_IP" | awk '{print $1}' | head -1)"
    [ -n "$RES" ] && PUBLIC_IP="$RES"
    ;;
esac

# Red confiable (exenta del anti-flood): por defecto el /24 de la propia IP.
if [ -z "${TRUSTED_NET:-}" ]; then
  TRUSTED_NET="$(echo "$SELF_IP" | awk -F. '{print $1"."$2"."$3".0/24"}')"
fi

DB_URL="postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

cd /etc/kamailio
# El separador es | porque la DB_URL trae barras.
sed -i \
  -e "s|@@DB_URL@@|${DB_URL}|g" \
  -e "s|@@SELF_IP@@|${SELF_IP}|g" \
  -e "s|@@PUBLIC_IP@@|${PUBLIC_IP}|g" \
  -e "s|@@TRUSTED_NET@@|${TRUSTED_NET}|g" \
  kamailio.cfg

echo "[SBC-NG] self=${SELF_IP} publica=${PUBLIC_IP} confiable=${TRUSTED_NET}"

# Validar la sintaxis ANTES de arrancar: una config inválida deja el borde mudo.
kamailio -c -f /etc/kamailio/kamailio.cfg || { echo "[SBC-NG] kamailio.cfg inválido"; exit 1; }

# Esperar a la base (las tablas dispatcher/address/secfilter las lee al arrancar).
for i in $(seq 1 30); do
  if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  echo "[SBC-NG] esperando la base… ($i)"
  sleep 1
done

exec "$@"
