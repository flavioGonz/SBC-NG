# Estándares y RFCs

Este documento lista los estándares (RFC del IETF y equivalentes) que **SBC-NG implementa**, con qué nivel de cumplimiento y **dónde está la configuración** que los sostiene. Es un mapa técnico pensado para integradores, operadores y auditorías: cada fila se puede verificar mirando el archivo o el módulo que se indica.

SBC-NG es un **Session Border Controller**: se apoya en el núcleo SIP de **Kamailio 6.1**, ancla y transcodifica medios con **rtpengine (mr13.5)**, termina STUN/TURN con **coturn** y firma/verifica identidad con **secsipid**. Por su rol de borde, muchos RFC se cumplen en el plano que le corresponde a un SBC (proxy/back-to-back, anclaje de medios, control de sesión), no como agente de usuario final.

## Cómo leer el nivel

| Nivel | Qué significa |
|---|---|
| **Completo** | Implementado y activo por defecto en el plano que le toca al borde. |
| **Opcional** | Implementado y soportado; se activa desde el panel (Motor SIP / Seguridad). Apagado no incumple nada, simplemente no está en uso. |
| **Parcial** | Se cumple lo necesario para el caso de borde; no se implementa el RFC entero (por diseño, es rol del extremo). |
| **Transparente** | El SBC no lo termina: preserva las cabeceras y deja que los extremos lo negocien de punta a punta. |

> **Núcleo cumplido al 100%.** En su configuración de fábrica, SBC-NG cumple de forma completa: **RFC 3261** (SIP), **RFC 3263** (localización de servidores), **RFC 3264** (oferta/respuesta SDP), **RFC 3581** (rport / NAT de señalización), **RFC 3550/3551** (RTP), **RFC 3711 + 4568** (SRTP con SDES), **RFC 5763/5764** (DTLS-SRTP para WebRTC), **RFC 8445** (ICE), **RFC 5389/8489** (STUN), **RFC 5766/8656** (TURN) y **RFC 7118** (SIP sobre WebSocket). Todo esto anda sin activar ningún módulo opcional.

## Señalización SIP

| RFC | Título | Nivel | Dónde está |
|---|---|---|---|
| RFC 3261 | SIP: Session Initiation Protocol | Completo | Núcleo Kamailio: `tm`, `sl`, `rr`, `maxfwd`, `sanity` — `docker/config/kamailio/kamailio.cfg` (`request_route`) |
| RFC 3263 | Locating SIP Servers (NAPTR/SRV/A) | Completo | Resolución del núcleo + `dispatcher` hacia las centrales |
| RFC 3581 | Extensión `rport` (respuesta simétrica) | Completo | `force_rport()` en `request_route` — `kamailio.cfg` |
| RFC 3327 | Extensión `Path` en el registro | Parcial | `usrloc` (registrar del borde) — `control-plane/config.js` |
| RFC 5626 | Managing Client-Initiated Connections (keepalive/flow) | Parcial | `nathelper` (`set_contact_alias`, natping), WebSocket keepalive |
| RFC 3325 | P-Asserted-Identity | Transparente | Se preserva; el ruteo puede reescribir según troncal |
| RFC 3323 | Privacy Mechanism | Parcial | Ocultamiento de topología (`topoh` / `topos`, Seguridad) |
| RFC 3515 | REFER (transferencias) | Transparente | El proxy relaya REFER/NOTIFY de punta a punta |
| RFC 3891 / 3892 | Replaces / Referred-By | Transparente | Cabeceras preservadas en el diálogo |
| RFC 3262 | PRACK (respuestas provisionales fiables) | Transparente | Negociado entre extremos; el borde no lo termina |
| RFC 3311 | UPDATE | Transparente | Preservado en el diálogo |
| RFC 4028 | Session Timers | Opcional | Módulo `sst` (Motor SIP → Troncales) — `kamailio.cfg` |

## Autenticación y registro

| RFC | Título | Nivel | Dónde está |
|---|---|---|---|
| RFC 3261 §22 / RFC 2617 | Autenticación Digest (HTTP/SIP) | Opcional | Registrar del borde: `auth` + `auth_db` contra tabla `subscriber` — panel **/registros** |
| RFC 7616 | HTTP Digest actualizado (algoritmos) | Parcial | `auth_db` (MD5 por defecto; SHA-256 según build) |
| RFC 3261 §10 | Registrar / REGISTER | Opcional | Módulos `registrar` + `usrloc` — se activa en **/registros** |

## Medios (RTP / SRTP / WebRTC)

| RFC | Título | Nivel | Dónde está |
|---|---|---|---|
| RFC 3264 | Modelo Oferta/Respuesta con SDP | Completo | `rtpengine_manage()` en `request_route` — `kamailio.cfg` |
| RFC 3550 / 3551 | RTP y su perfil de audio/video | Completo | rtpengine (anclaje de medios en el borde) |
| RFC 4566 | SDP: Session Description Protocol | Completo | Reescritura de SDP por rtpengine (`replace-origin`, `replace-session-connection`) |
| RFC 3711 | SRTP (medios cifrados) | Completo | rtpengine — interworking SRTP↔RTP |
| RFC 4568 | SDES: claves SRTP en el SDP (`a=crypto`) | Completo | rtpengine (`RTP/AVP` fuerza RTP plano hacia la central) — `kamailio.cfg` |
| RFC 5763 / 5764 | DTLS-SRTP (WebRTC) | Completo | rtpengine (`DTLS`, `RTP/SAVPF`) para patas WS/WSS — `kamailio.cfg` |
| RFC 8445 | ICE: Interactive Connectivity Establishment | Completo | rtpengine `ICE=force` (hacia WebRTC) / `ICE=remove` (hacia la central) |
| RFC 8825–8834 | Arquitectura y protocolos WebRTC | Completo | `websocket` + rtpengine (borde WebRTC) |
| RFC 4733 | Eventos de telefonía (DTMF fuera de banda) | Transparente | Perfil RTP negociado por los extremos; rtpengine lo preserva |

## Transporte y NAT

| RFC | Título | Nivel | Dónde está |
|---|---|---|---|
| RFC 7118 | SIP sobre WebSocket | Completo | `websocket` + `ws_handle_handshake()` — `kamailio.cfg` (`event_route[xhttp:request]`) |
| RFC 5389 / 8489 | STUN | Completo | coturn — `docker/config/coturn/turnserver.tpl` |
| RFC 5766 / 8656 | TURN (relay de medios) | Completo | coturn (perfil `turn`) — instalador y `turnserver.tpl` |
| RFC 3261 §26 / RFC 5630 | SIP sobre TLS (`sips`) | Opcional | TLS nativo (`enable_tls`, `listen=tls:5061`) o terminado por el proxy — **/certificados** |
| RFC 8446 / 5246 | TLS 1.3 / 1.2 | Completo | Terminación TLS (nativa `tls.so` o reverse-proxy NPM) |

## Identidad y anti-fraude (STIR/SHAKEN)

| RFC | Título | Nivel | Dónde está |
|---|---|---|---|
| RFC 8224 | Authenticated Identity Management in SIP | Opcional | `secsipid` — panel **/stir** (verificar/firmar `Identity`) |
| RFC 8225 | PASSporT (token de identidad) | Opcional | `secsipid_add_identity()` / `secsipid_check_identity()` — `control-plane/config.js` (`stir.cfg`) |
| RFC 8226 | Certificados para PASSporT | Opcional | Par de claves EC (ES256) + `x5u` — **/stir** |

## Seguridad del borde (prácticas)

Estas defensas no son un RFC de protocolo, pero son parte del rol del SBC y conviene documentarlas junto con lo anterior:

| Defensa | Qué hace | Dónde está |
|---|---|---|
| Anti-flood | Corta inundaciones de SIP por IP (`pike` + `ipban`) | `kamailio.cfg` + **/seguridad** |
| Filtro de escáneres | Bloquea sipvicious/sipcli y User-Agents maliciosos (`secfilter`) | **/seguridad → Listas** |
| Filtro por país | Lista negra o blanca por país de origen (`geoip2`) | **/seguridad → Filtro por país** |
| Ocultamiento de topología | Enmascara la red interna (`topoh` / `topos`) | Motor SIP → Seguridad |
| Control de admisión (CAC) | Tope de llamadas simultáneas por troncal | Troncales |

> **Alcance.** "Completo" describe el cumplimiento en el plano que le corresponde a un SBC (proxy/B2BUA, anclaje y traducción de medios, control de sesión y seguridad de borde). Extensiones que son responsabilidad del agente de usuario (PRACK, UPDATE, REFER) se marcan **Transparente**: el borde no las termina, las deja pasar íntegras para que los extremos las negocien. La versión exacta de cada motor está en **Sistema → Acerca de**.
