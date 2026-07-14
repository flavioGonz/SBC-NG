# SBC-NG

**Session Border Controller** para telefonía IP: el borde que se pone entre Internet y tu central.
Funciona **solo** — delante de PBX-NG, de un 3CX, un FreePBX, un Issabel, un Asterisk propio o de
cualquier central que hable SIP.

> SBC-NG nació adentro de [PBX-NG](https://github.com/flavioGonz/pbx-ng) y se separó como producto:
> lo que hace es útil aunque la central sea de otro.

---

## Qué hace

| Plano | Componente | Función |
|---|---|---|
| **Señalización** | Kamailio | Proxy SIP: filtra, normaliza, rutea y esconde la topología de tu red |
| **Medios** | rtpengine | Ancla el RTP, hace SRTP ↔ RTP y **transcoding** (G.711 · G.722 · Opus · G.729) |
| **NAT** | coturn | STUN/TURN: hace que WebRTC funcione detrás de cualquier NAT |
| **WebRTC** | wsbridge | Gateway WSS → SIP: navegadores y celulares contra una central que sólo habla SIP |
| **Control** | control-plane | API REST + panel: troncales, ruteo, seguridad, métricas y diagnóstico |

### Seguridad (lo que evita la factura sorpresa)

- **Anti-flood** (`pike`): corta la ráfaga de registros antes de que llegue a la central.
- **IP ban** automático, con país e ISP de cada bloqueo.
- **secfilter**: filtra escáneres conocidos por User-Agent y patrón.
- **Antifraude**: límites por troncal y por cliente (CAC), destinos prohibidos, horarios.
- **TLS y SRTP** de punta a punta.

### Operación

- **LCR / dispatcher**: balanceo y *failover* entre varias centrales o varios operadores.
- **Captura**: el diálogo SIP de cualquier llamada, en vivo y en pcap. HEP/Homer opcional.
- **Test de troncal**: OPTIONS, registro, llamada de prueba y diagnóstico en criollo.
- **Multi-tenant**: varios clientes en el mismo SBC, cada uno con su realm y sus reglas.

## Instalación

```bash
git clone https://github.com/flavioGonz/SBC-NG
cd SBC-NG
sudo ./install.sh
```

El instalador levanta Kamailio, rtpengine, coturn, la base y el control-plane, y te deja el panel
en `https://<tu-dominio>` (o por IP, en el puerto 3100, para verificar que está vivo).

## Enganchar una central

SBC-NG no asume nada de la central que tiene detrás: se le declara y listo.

```bash
curl -X POST https://sbc.tu-dominio/api/v1/attach \
  -H "Authorization: Bearer $SBC_TOKEN" \
  -d '{"name":"PBX principal","sip_uri":"sip:192.168.1.10:5060","priority":10}'
```

Desde ese momento el SBC le manda las llamadas entrantes y acepta las salientes de esa IP.
PBX-NG lo hace solo desde su panel; cualquier otra central se declara con esta llamada.

## Estándares

SBC-NG no inventa nada: implementa los RFC al pie de la letra.

| RFC | Qué |
|---|---|
| 3261 | SIP |
| 3263 | Localización de servidores SIP (NAPTR/SRV) |
| 3264 | Oferta/respuesta SDP |
| 3550 / 3551 | RTP |
| 3711 | SRTP |
| 4028 | Timers de sesión |
| 4733 | DTMF en RTP |
| 5389 / 8656 | STUN / TURN |
| 5763 / 5764 | DTLS-SRTP (lo que exige WebRTC) |
| 7118 | SIP sobre WebSocket |
| 8445 | ICE |

## Documentación

- [API norte](docs/API.md) — el contrato con la central
- [Arquitectura](docs/ARQUITECTURA.md)
- [Puertos y firewall](docs/FIREWALL.md)

## Licencia

Producto comercial de Infratec. Todos los derechos reservados.
