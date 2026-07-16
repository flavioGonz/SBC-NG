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

# Token para /metrics (Prometheus). Lo GENERA el control-plane (que monta /etc/sbcng en
# RW); acá SOLO se lee — este volumen es read-only para kamailio. Se espera un momento a
# que el control-plane lo escriba; si no aparece, /metrics queda cerrado hasta el próximo
# arranque (no es crítico: no afecta las llamadas).
METRICS_TOKEN="cerrado"
for _i in $(seq 1 15); do
  if [ -s /etc/sbcng/metrics.token ]; then METRICS_TOKEN="$(cat /etc/sbcng/metrics.token)"; break; fi
  sleep 1
done
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
  -e "s|@@METRICS_TOKEN@@|${METRICS_TOKEN}|g" \
  kamailio.cfg

echo "[SBC-NG] self=${SELF_IP} publica=${PUBLIC_IP} confiable=${TRUSTED_NET}"

# Reglas SIP generadas por el panel. Viven en el volumen compartido (/etc/sbcng, de
# solo lectura) y se copian al arbol de Kamailio. Si todavia no hay reglas, se escribe
# un fragmento VACIO pero VALIDO: Kamailio no arranca si llama a una route que no
# existe, y un SBC que no levanta por no tener reglas es un absurdo.
if [ -f /etc/sbcng/reglas.cfg ]; then
  cp /etc/sbcng/reglas.cfg /etc/kamailio/reglas.cfg
  echo "[SBC-NG] reglas SIP del panel cargadas"
else
  printf 'route[SBCNG_REGLAS_SALIENTE] {
  return;
}
route[SBCNG_REGLAS_ENTRANTE] {
  return;
}
' > /etc/kamailio/reglas.cfg
  echo "[SBC-NG] sin reglas SIP: el mensaje pasa tal cual"
fi

# Umbrales de defensa (pike, duracion del bloqueo, secfilter, TLS). Igual que las
# reglas: si el panel todavia no los genero, se escriben los de fabrica. El borde
# tiene que defenderse desde el primer arranque, no desde la primera vez que alguien
# entra al panel.
if [ -f /etc/sbcng/seguridad.cfg ]; then
  cp /etc/sbcng/seguridad.cfg /etc/kamailio/seguridad.cfg
  echo "[SBC-NG] umbrales de seguridad del panel cargados"
else
  cat > /etc/kamailio/seguridad.cfg <<EOF
# valores de fabrica (el panel todavia no genero los suyos)
modparam("pike", "sampling_time_unit", 10)
modparam("pike", "reqs_density_per_unit", 30)
modparam("pike", "remove_latency", 4)
modparam("htable", "htable", "ipban=>size=8;autoexpire=3600;")
#!define SBCNG_SECFILTER
EOF
  echo "[SBC-NG] umbrales de seguridad de fabrica"
fi

# Modulos que el panel prendio (topoh, siptrace, debugger...). Igual que el resto:
# si no hay nada configurado, un archivo vacio y a otra cosa.
if [ -f /etc/sbcng/modulos.cfg ]; then
  cp /etc/sbcng/modulos.cfg /etc/kamailio/modulos.cfg
  echo "[SBC-NG] modulos del panel cargados"
else
  echo "# sin modulos extra" > /etc/kamailio/modulos.cfg
fi

# STIR/SHAKEN: el panel decide si se verifica/firma el Identity y con que clave/x5u.
# Si todavia no lo configuro, un fragmento VACIO: el modulo queda cargado pero inerte.
if [ -f /etc/sbcng/stir.cfg ]; then
  cp /etc/sbcng/stir.cfg /etc/kamailio/stir.cfg
  echo "[SBC-NG] STIR/SHAKEN configurado por el panel"
else
  echo "# STIR/SHAKEN apagado (el panel no lo configuro)" > /etc/kamailio/stir.cfg
fi
mkdir -p /tmp/secsipid

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
