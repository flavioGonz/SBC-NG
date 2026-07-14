# Arquitectura de SBC-NG

## Los planos

| Plano | Quién | Por dónde |
|---|---|---|
| **Señalización** | Kamailio | SIP 5060/5061 (UDP, TCP, TLS) |
| **Medios** | rtpengine | RTP 30000-40000/udp |
| **NAT** | coturn | STUN/TURN 3478 + relay 49152-65535/udp |
| **WebRTC** | wsbridge | WSS 443 → SIP |
| **Control** | control-plane | HTTP 3100 (API norte + panel) |
| **Estado** | PostgreSQL | interna |

Kamailio y rtpengine corren en **modo host**: el SIP y el RTP tienen que ver las IPs reales. Si
pasaran por el NAT de Docker, las direcciones que anuncian en el SDP serían las del contenedor y el
audio nunca llegaría.

## Por qué el control-plane no usa una tabla como bus

En la primera versión (cuando el SBC vivía dentro de PBX-NG), la central le dejaba "recados" al SBC
insertando filas en una tabla y un agente hacía polling. Funcionaba, pero **ataba los dos productos
a la misma base**: el SBC no podía instalarse solo.

Ahora el control-plane le habla a Kamailio por su **RPC** y a rtpengine por su protocolo **ng**. Es
sincrónico (sabés si el comando funcionó), es más rápido, y sobre todo: la base es nuestra y de
nadie más.

## Multi-tenant desde el día uno

Todas las tablas llevan `tenant_id`. En una instalación de un solo cliente hay un tenant y no se
nota; pero agregar esa columna después obliga a migrar todo. Un mayorista puede poner un SBC-NG
adelante de N clientes, cada uno con su realm, sus troncales, sus límites (CAC) y sus métricas.

## Transcoding

rtpengine se compila con soporte de códecs: G.711 (PCMU/PCMA), G.722, Opus y G.729. Es lo que
permite que un softphone WebRTC (que habla Opus) llame a través de un operador que **sólo** habla
G.729 — sin transcoding, esa llamada no existe.

Transcodificar cuesta CPU: se activa **por troncal**, no globalmente.
