# SBC-NG · Kamailio 6.1 (señalización del borde)
#
# Sin agente ni psycopg2: el control-plane le habla por RPC (jsonrpcs + xhttp en /RPC).
# Antes había un agente Python que hacía polling de una tabla de la central; eso ataba
# los dos productos a la misma base. Ya no.
FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates gnupg wget iproute2 gettext-base postgresql-client tcpdump \
    && wget -qO- https://deb.kamailio.org/kamailiodebkey.gpg | gpg --dearmor > /usr/share/keyrings/kamailio.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/kamailio.gpg] http://deb.kamailio.org/kamailio61 bookworm main" \
       > /etc/apt/sources.list.d/kamailio.list \
    && apt-get update && apt-get install -y --no-install-recommends \
      kamailio kamailio-postgres-modules kamailio-tls-modules kamailio-websocket-modules \
      kamailio-presence-modules kamailio-json-modules kamailio-utils-modules kamailio-extra-modules \
      kamailio-secsipid-modules \
    && rm -rf /var/lib/apt/lists/*

COPY config/kamailio/ /etc/kamailio/
COPY images/kamailio/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# SIP (UDP/TCP), TLS, WebSocket y el RPC del control-plane
EXPOSE 5060/udp 5060/tcp 5061/tcp 8088/tcp

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["kamailio", "-DD", "-E", "-m", "64", "-M", "8"]
