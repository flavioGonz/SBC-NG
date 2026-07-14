# SBC-NG · coturn (STUN/TURN)
#
# Sin agente HTTP: el control-plane comprueba el TURN como lo haría un cliente
# (mandándole un Allocate real), que es la única prueba que vale.
FROM coturn/coturn:latest
USER root
COPY config/coturn/turnserver.tpl /etc/coturn/turnserver.tpl
COPY images/coturn/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["turnserver", "-c", "/etc/turnserver.conf"]
