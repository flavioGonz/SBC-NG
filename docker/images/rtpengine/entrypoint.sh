#!/usr/bin/env sh
# ============================================================================
#  SBC-NG · rtpengine
#
#  El SDP tiene que anunciar la IP PÚBLICA, no la del contenedor: por eso la
#  interfaz se declara como <IP interna>!<IP pública>. Si se anuncia la interna,
#  el otro extremo manda el RTP a una IP que no existe en internet y la llamada
#  queda muda (el clásico "atiende pero no se escucha nada").
# ============================================================================
set -e

: "${PORT_MIN:=30000}"
: "${PORT_MAX:=40000}"
: "${TIMEOUT:=60}"
: "${SILENT_TIMEOUT:=3600}"
: "${LOG_LEVEL:=6}"

LAN="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"
[ -z "$LAN" ] && LAN="$(hostname -i | awk '{print $1}')"

: "${PUBLIC_IP:=$LAN}"
# Si la IP pública es un nombre (DDNS), la resolvemos al arrancar.
case "$PUBLIC_IP" in
  *[a-zA-Z]*)
    RES="$(getent hosts "$PUBLIC_IP" | awk '{print $1}' | head -1)"
    [ -n "$RES" ] && PUBLIC_IP="$RES"
    ;;
esac

echo "[SBC-NG] rtpengine: interfaz ${LAN}!${PUBLIC_IP} · puertos ${PORT_MIN}-${PORT_MAX}"
echo "[SBC-NG] códecs disponibles para transcoding: PCMU PCMA G722 opus G729"

exec rtpengine \
  --foreground \
  --interface "${LAN}!${PUBLIC_IP}" \
  --listen-ng 127.0.0.1:2223 \
  --port-min "${PORT_MIN}" \
  --port-max "${PORT_MAX}" \
  --timeout "${TIMEOUT}" \
  --silent-timeout "${SILENT_TIMEOUT}" \
  --log-level "${LOG_LEVEL}" \
  --log-stderr
