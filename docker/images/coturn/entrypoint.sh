#!/bin/sh
# ============================================================================
#  SBC-NG · coturn
#
#  coturn sólo acepta una IP literal en external-ip, y la lee UNA vez al
#  arrancar. Si la IP pública es dinámica (DDNS), hay que resolverla acá y
#  reiniciar el contenedor cuando cambie — el watcher del instalador lo hace.
#  Si no, el TURN sigue entregando candidatos relay con la IP vieja y el WebRTC
#  se queda sin audio sin que nadie entienda por qué.
# ============================================================================
set -e

# realm, credencial, IP publica y rango de relay: los escribe el panel.
[ -f /etc/sbcng/coturn.env ] && . /etc/sbcng/coturn.env

: "${TURN_REALM:=${DOMAIN:-sbc.local}}"
: "${TURN_USER:=sbcng}"

# Si el TURN todavia no se configuro desde el panel (sin credencial, o apagado), el
# contenedor NO se muere: se queda esperando. Antes reventaba y entraba en bucle de
# reinicio: el panel mostraba "detenido" como si algo estuviera roto, y al aplicar la
# configuracion no habia contenedor que reiniciar. Quieto y presente es mejor que
# muerto y reintentando.
if [ "${TURN_HABILITADO:-yes}" = "no" ] || [ -z "${TURN_PASS:-}" ]; then
  echo "[SBC-NG] TURN apagado o sin credencial: en espera. Configuralo en el panel (Medios -> TURN/STUN) y aplica."
  exec sleep infinity
fi

SELF_IP="${SELF_IP:-$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')}"
[ -n "$SELF_IP" ] || SELF_IP="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^127\.' | head -1)"

: "${TURN_EXT_IP:=${PUBLIC_IP:-$SELF_IP}}"
case "$TURN_EXT_IP" in
  *[a-zA-Z]*)
    RES="$(getent hosts "$TURN_EXT_IP" | awk '{print $1}' | head -1)"
    [ -n "$RES" ] && TURN_EXT_IP="$RES"
    ;;
esac

# Detrás de NAT: se anuncia la pública mapeada a la privada.
if [ -n "$SELF_IP" ] && [ -n "$TURN_EXT_IP" ] && [ "$TURN_EXT_IP" != "$SELF_IP" ]; then
  TURN_EXT_IP="${TURN_EXT_IP}/${SELF_IP}"
fi

echo "[SBC-NG] coturn: external-ip=${TURN_EXT_IP} realm=${TURN_REALM}"

sed -e "s|@@TURN_REALM@@|${TURN_REALM}|g" \
    -e "s|@@TURN_USER@@|${TURN_USER}|g" \
    -e "s|@@TURN_PASS@@|${TURN_PASS}|g" \
    -e "s|@@TURN_EXT_IP@@|${TURN_EXT_IP}|g" \
    -e "s|@@PORT_MIN@@|${TURN_PORT_MIN:-49152}|g" \
    -e "s|@@PORT_MAX@@|${TURN_PORT_MAX:-65535}|g" \
    /etc/coturn/turnserver.tpl > /etc/turnserver.conf

# Ajustes finos del panel (clave=valor;clave=valor). Se pegan al final del conf:
# en coturn lo ultimo definido es lo que vale, asi que pisan lo de arriba.
if [ -n "${TURN_EXTRA:-}" ]; then
  echo "" >> /etc/turnserver.conf
  echo "# --- ajustes del panel ---" >> /etc/turnserver.conf
  echo "$TURN_EXTRA" | tr ';' '\n' >> /etc/turnserver.conf
fi

exec "$@"
