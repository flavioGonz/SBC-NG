# Capacidades nuevas de los motores — qué podemos hacer ahora

Base: **Kamailio 6.1.3** (era 5.6.6) y **rtpengine mr13.5.1.19** (era mr11.5). 
⭐ = candidato claro a feature del panel. 🔧 = bajo el capó / config del borde. 

---

# KAMAILIO 6.1 — señalización

## Rendimiento y escala 🔧
- **UDP multi-hilo** (`udp_receiver_mode`): un proceso multi-hilo recibiendo el 5060 en vez de N procesos → más llamadas/seg sin tocar dialplan. Se puede agrupar receptores por socket (`agname`).
- **Rango de puertos en un mismo listen** (bind a un rango, no un puerto a la vez).
- **Apagado más limpio**: la memoria compartida ya no se destruye pieza por pieza al frenar.
- **Compilación con cmake** (moderniza el build de la imagen).

## Observabilidad y métricas ⭐
- **Prometheus nativo** (`xhttp_prom`): expone uptime, memoria, contadores SIP, 4xx, etc. → alimentar Grafana del cliente o reemplazar parte del polling casero del Resumen.
- **Etiquetas Prometheus** configurables (`xhttp_prom_tags`).
- **Nuevos contadores 4xx por código** de respuesta.
- **Reportes de accounting** (via kamcli/acc): **llamadas perdidas**, **top destinos**, **stats por método SIP** → enriquecer el CDR del borde.

## Protección de las centrales (dispatcher) ⭐
- **Overload Control RFC 7339**: si una central se ahoga, el SBC le baja el caudal en vez de tumbarla. Algoritmo `DS_ALG_OVERLOAD` como flag (64), RPC `dispatcher.oclist`, campos `$dsg(...)` de sobrecarga.
- **Flag 32**: marcar un destino para NO pingear (útil para un backup que no querés estar sondeando).
- **Buscar destino por group id + uri**.

## Seguridad e identidad ⭐
- **STIR/SHAKEN** (`secsipid`): verificar la identidad criptográfica del CallerID (anti-spoofing / anti-fraude). Encaja natural en el SOC: "llamada con identidad no verificada".
- **permissions `allow_register_include_port()`**: chequear el contacto a registrar incluyendo el puerto (control más fino de quién puede registrar).
- **auth `auth_algorithm()`**: forzar/override del algoritmo de digest dinámicamente.
- **TLS con OpenSSL 3**: provider keys (reemplaza el ENGINE deprecado), contraseña de clave privada (`key_password_mode`).
- **gcrypt**: API AES-128 expuesta.

## Diálogo, sesiones y ruteo 🔧
- **dialog**: `dlg_set_state()` / `dlg_update_state()` (control de estado de la llamada), `dlg_mode` (reemplazó al `dlg_flag` que migramos), stats por `dlgs`.
- **tm**: event_route en CANCEL, timeout configurable (`reply_408_code`/`reply_408_reason`), `headers_mode`, `t_cell_append_branches()`.
- **uac**: registrar/desregistrar remoto por RPC, `reload_delta` (recargar troncales sin reinicio).

## Manipulación SIP/SDP (para la UI de transcoding y normalización) ⭐🔧
- **sdpops / `$sdp(...)`**: `$sdp(m0:rtp:port)` (puerto RTP real), `$sdp(o:ip)` (IP de origen del medio), `$sdp(m0:rtcp:port)`, `$sdp(c:af)` (familia de dirección), `$sdp(m0:raw)`, anchos de banda `b:AS/RR/RS`. → mostrar más detalle en **Transcoding en vivo** sin depender de la captura.
- **pv**: `$ctu` (URI del Contact), `$cts` (Contact star), transformaciones nuevas (`{s.rmhdws}`, `{s.rmhlws}`), `$K(IP4/IP6)` estilo SDP.
- **siputils**: `is_sip()`, `is_http()`, manejo de P-Charging-Vector con `$pcv(status)`.
- **htable**: operadores `ew` (termina-con) e `in` para borrar/filtrar entradas (útil en las listas del SOC).
- **textops**: `subst_v()` (sustitución guardando en variable).
- **ipops**: consultas PTR (DNS inverso).

## Integraciones (disponibles si algún cliente las pide) 🔧
- **HTTP/2 server** (`nghttp2`).
- **http_client**: método HTTP configurable, guardar headers de respuesta (`$httprhdr`).
- **Kafka** y **RabbitMQ** (reconexión no bloqueante: si el broker está caído, Kamailio igual arranca).
- **pvtpl**: plantillas evaluadas con variables de config.
- **topos_htable**: topology hiding guardado en htable (alternativa al topos con DB).
- **corex**: cache DNS desde archivo (`dns_file`), `forward_uac()`.

---

# RTPENGINE mr13.5 — medios

## Transcoding ⭐
- **Flag `force`**: forzar transcodificación entre los dos lados (garantizar un códec de salida sí o sí, aunque ambos "podrían" hablar el mismo).
- **Opción `ignore` de códec**: como `strip`, pero afecta sólo a los códecs del SDP **entrante** → control más quirúrgico por troncal (ej. "ignorá el G.729 que ofrece el operador aunque lo liste").
- **Método NG `transform`** → **nodos de transcoding dedicados**: sacar la carga de códecs a máquinas aparte del borde principal. Base de una arquitectura de medios distribuida para clientes grandes.

## Medios y arquitectura 🔧
- **Interfaces RTP por archivo de config** + **rangos de puertos distintos por interfaz** → encaja con la separación LAN/WAN (rangos de medios propios por placa, declarativo).
- **io_uring** (compilado con soporte): ruta de I/O de alto rendimiento del kernel moderno para el RTP.
- **Music on Hold modo `reflect`**: reusa las capacidades de MoH del otro extremo.
- **Mejoras de ICE/DTLS** (WebRTC) y muchos bugfixes de estabilidad que en mr11 arrastrábamos.

## Operación y control ⭐
- **`rtpengine.show` con campo `active`** (ya lo vimos): estado real del motor de medios reportado a Kamailio → pintarlo bien en la topología, sin inferirlo.
- **Timer de ping a las instancias de rtpengine** (desde el módulo de Kamailio 6.x) → detección temprana de un motor de medios caído.
- **LTS**: parches por años sin cambiar comportamiento — estabilidad para un appliance que se instala y no se toca.

---

# Resumen: las 6 que más mueven la aguja para vender/operar

1. **Prometheus** → métricas reales del borde para Grafana / Resumen. (Kamailio)
2. **Overload Control** → el SBC protege a las centrales de la sobrecarga. (Kamailio)
3. **STIR/SHAKEN** → verificación de identidad anti-fraude en el SOC. (Kamailio)
4. **rtpengine `active` + ping-timer** → estado real del motor de medios en la topología. (ambos)
5. **Transcoding `force`/`ignore` por troncal** → control fino de códecs, ya con UI donde vive. (rtpengine)
6. **Nodos de transcoding dedicados (`transform`)** → escalar clientes grandes sin quemar CPU del borde. (rtpengine)

Cada una es independiente y se puede cortar como un release chico. El detalle de esfuerzo/riesgo está en `docs/EVALUACION-MOTORES-2026.md`.

---
## Nota de compatibilidad (2026-07-15)
- **UDP multi-hilo (`udp_receiver_mode=1`)**: PROBADO en CT113 y **REVERTIDO** — con nuestra config (`children=4`, contenedor) rompe el UDP ENTRANTE: el core dejó de recibir respuesta al OPTIONS (troncal/central Unavail), aunque el WSS/TCP seguía. No usar sin más investigación (quizá requiere ajustar `children`/`socket_workers`). El resto de las capacidades no dependen de esto.
