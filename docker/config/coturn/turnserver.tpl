# SBC-NG · coturn
# Los @@TOKENS@@ los resuelve el entrypoint desde el entorno.

listening-port=3478
fingerprint
lt-cred-mech
realm=@@TURN_REALM@@
user=@@TURN_USER@@:@@TURN_PASS@@

# La IP que se le entrega al cliente en el candidato relay. Detrás de NAT va
# publica/privada: sin esto, WebRTC recibe una IP inalcanzable y no hay audio.
external-ip=@@TURN_EXT_IP@@

min-port=@@PORT_MIN@@
max-port=@@PORT_MAX@@

no-tls
no-dtls

log-file=stdout
simple-log

# --- límites y seguridad ---
total-quota=200
stale-nonce=600
no-loopback-peers
no-multicast-peers
