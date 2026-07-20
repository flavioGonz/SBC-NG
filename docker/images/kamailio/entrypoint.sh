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

# --- Topology Hiding: topoh (cifra cabeceras) vs topos (guarda estado) ---
# Son EXCLUYENTES. El modo lo decide el PANEL (archivo topo.mode en el volumen
# compartido); si el archivo no está, cae al env TOPOH de siempre.
: "${TOPOH:=1}"
TOPOH_KEY="${TOPOH_KEY:-$(printf '%s' "${SELF_IP}${PUBLIC_IP}sbcng-topoh" | sha1sum | awk '{print substr($1,1,16)}')}"
TOPO_MODE=""
if [ -f /etc/sbcng/topo.mode ]; then TOPO_MODE="$(tr -d '[:space:]' < /etc/sbcng/topo.mode)"; fi
case "$TOPO_MODE" in
  topos) TOPOH_DEFINE='# topoh apagado: el panel eligió topos'; echo "[SBC-NG] ocultamiento de topología: topos" ;;
  none)  TOPOH_DEFINE='# ocultamiento de topología apagado desde el panel' ;;
  topoh) TOPOH_DEFINE='#!define SBCNG_TOPOH'; echo "[SBC-NG] ocultamiento de topología: topoh" ;;
  *)     if [ "$TOPOH" = "1" ]; then TOPOH_DEFINE='#!define SBCNG_TOPOH'; else TOPOH_DEFINE='# topoh deshabilitado (TOPOH=0)'; fi ;;
esac

cd /etc/kamailio
# La cfg base se REGENERA del template en cada arranque. Sin esto, el sed sólo servía
# la primera vez: al reiniciar el contenedor los @@TOKENS@@ ya estaban reemplazados y
# un cambio de valor (p.ej. pasar de topoh a topos, o una IP pública nueva) no se
# aplicaba nunca. El template se guarda en el primer arranque y no se toca más.
if [ ! -f /etc/kamailio/kamailio.cfg.tpl ]; then cp /etc/kamailio/kamailio.cfg /etc/kamailio/kamailio.cfg.tpl; fi
cp /etc/kamailio/kamailio.cfg.tpl /etc/kamailio/kamailio.cfg

# El separador es | porque la DB_URL trae barras.
sed -i \
  -e "s|@@DB_URL@@|${DB_URL}|g" \
  -e "s|@@SELF_IP@@|${SELF_IP}|g" \
  -e "s|@@PUBLIC_IP@@|${PUBLIC_IP}|g" \
  -e "s|@@TRUSTED_NET@@|${TRUSTED_NET}|g" \
  -e "s|@@METRICS_TOKEN@@|${METRICS_TOKEN}|g" \
  -e "s|@@TOPOH_KEY@@|${TOPOH_KEY}|g" \
  -e "s|@@TOPOH_DEFINE@@|${TOPOH_DEFINE}|g" \
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

# Geo-bloqueo por pais: define route[GEOBLOCK]. Si el panel no lo configuro, una route
# inerte (return) para que el request_route pueda llamarla igual y Kamailio arranque.
if [ -f /etc/sbcng/geoblock.cfg ]; then
  cp /etc/sbcng/geoblock.cfg /etc/kamailio/geoblock.cfg
  echo "[SBC-NG] geo-bloqueo del panel cargado"
else
  echo "route[GEOBLOCK] { return; }" > /etc/kamailio/geoblock.cfg
fi

# Registrar del borde (#182): el fragmento define SBCNG_REGISTRAR + rutas EDGE_* cuando
# el panel lo activa. Si no, un comentario inerte: sin define, el #!ifdef del request_route
# no compila nada y el borde relaya el REGISTER a la central, como siempre.
if [ -f /etc/sbcng/registrar.cfg ]; then
  cp /etc/sbcng/registrar.cfg /etc/kamailio/registrar.cfg
  echo "[SBC-NG] registrar del borde cargado"
else
  echo "# registrar del borde apagado" > /etc/kamailio/registrar.cfg
fi

# DIDs entrantes: si el panel no configuró destinos, fragmento inerte.
if [ -f /etc/sbcng/dids.cfg ]; then
  cp /etc/sbcng/dids.cfg /etc/kamailio/dids.cfg
  echo "[SBC-NG] ruteo de DIDs cargado"
else
  echo "# sin DIDs con destino" > /etc/kamailio/dids.cfg
fi

# ─── TLS nativo (opcional): el SBC puede correr DETRAS de un proxy (que termina TLS)
# o SOLO, con su propio certificado (SIP/TLS 5061 + WSS 8443). Preparamos SIEMPRE el
# cert y el tls.cfg; el fragmento tls_native.cfg (listen=tls + enable_tls) decide si de
# verdad se abren los puertos. Cert: el de ACME si existe; si no, uno autofirmado (labs
# o entornos sin dominio) para que TLS igual funcione. ───
CERT_DIR=/etc/sbcng/certs
if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/key.pem" ]; then
  TLS_CRT="$CERT_DIR/fullchain.pem"; TLS_KEY="$CERT_DIR/key.pem"
  echo "[SBC-NG] TLS: certificado de ACME (Let's Encrypt)"
else
  mkdir -p /etc/kamailio/tls
  if [ ! -f /etc/kamailio/tls/self.crt ]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout /etc/kamailio/tls/self.key -out /etc/kamailio/tls/self.crt \
      -subj "/CN=${PUBLIC_IP:-sbc-ng}" >/dev/null 2>&1 || true
  fi
  TLS_CRT=/etc/kamailio/tls/self.crt; TLS_KEY=/etc/kamailio/tls/self.key
  echo "[SBC-NG] TLS: certificado autofirmado (todavía no hay cert de ACME)"
fi
cat > /etc/kamailio/tls.cfg <<TLSEOF
[server:default]
method = TLSv1.2+
verify_certificate = no
require_certificate = no
private_key = $TLS_KEY
certificate = $TLS_CRT
[client:default]
verify_certificate = no
require_certificate = no
TLSEOF
if [ -f /etc/sbcng/tls_native.cfg ]; then
  cp /etc/sbcng/tls_native.cfg /etc/kamailio/tls_native.cfg
  echo "[SBC-NG] TLS nativo según el panel"
else
  echo "# TLS nativo apagado (el proxy termina TLS)" > /etc/kamailio/tls_native.cfg
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
