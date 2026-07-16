<div align="center">

<img width="1024" height="1024" alt="image" src="https://github.com/user-attachments/assets/f12d0426-9ab6-4951-8dba-0b9d3055cb82" />

# SBC-NG

### El borde de tu telefonía IP

**Session Border Controller** que se pone entre internet y tu central.
Filtra los ataques, ancla los medios, atraviesa el NAT y rutea a los operadores.

**Funciona solo.** Delante de PBX-NG, de un 3CX, de un FreePBX, de un Issabel,
de un Asterisk propio… o de la central que ya tengas y no pensás cambiar.

<br>

<img width="1919" height="929" alt="image" src="https://github.com/user-attachments/assets/6f20062c-5a5b-4d89-9dd4-9c5e0fb25eb7" />


<sub>**Figura 1** · El panel de SBC-NG: llamadas en curso, ataques bloqueados y el estado de cada interfaz, en vivo · `01-dashboard.png`</sub>

</div>

---

## Por qué existe

Una central telefónica conectada directo a internet es una tarjeta de crédito abierta sobre la mesa.
A los pocos minutos de publicar el puerto 5060 empiezan a llegar los escaneos; en cuestión de días
alguien encuentra una contraseña débil y te factura miles de dólares en llamadas a destinos premium
mientras dormís.

Un SBC no es un lujo: **es la puerta blindada**. Y de paso resuelve los tres problemas que hacen que
la telefonía IP "no funcione" sin que nadie entienda por qué: el NAT, los códecs y los medios.

| Sin SBC | Con SBC-NG |
|---|---|
| La central da la cara a internet | La central vive en una red privada; el mundo sólo ve al SBC |
| Un escaneo llega hasta el registro SIP | Se corta en el borde: anti-flood, IP ban y filtro de escáneres |
| El fraude se descubre con la factura | Se corta en el momento: CAC, destinos prohibidos, horarios |
| WebRTC no funciona detrás de NAT | TURN propio: el navegador llama desde cualquier red |
| Un operador que sólo habla G.729 rechaza tus llamadas WebRTC | **Transcoding**: Opus ↔ G.729 ↔ G.711 ↔ G.722 |
| El operador ve tu red interna | *Topology hiding*: sólo ve al SBC |

---

## Qué hay adentro

| Plano | Componente | Qué hace |
|---|---|---|
| **Señalización** | Motor SIP | Proxy SIP: filtra, normaliza, rutea y esconde la topología |
| **Medios** | Motor de medios | Ancla el RTP, hace SRTP ↔ RTP y **transcodifica** |
| **NAT** | TURN Server | STUN/TURN: WebRTC detrás de cualquier NAT |
| **WebRTC** | Gateway WebRTC | WSS → SIP: navegadores contra una central que sólo habla SIP |
| **Control** | control-plane | API REST + panel: troncales, ruteo, seguridad, métricas, diagnóstico |
| **Estado** | PostgreSQL | Base **propia**: SBC-NG no comparte ni una tabla con la central |

<sub>Los motores de señalización, medios y NAT son componentes internos del appliance; el panel y esta
documentación los nombran de forma neutra (**Motor SIP**, **Motor de medios**, **TURN Server**).</sub>

![Arquitectura de SBC-NG](docs/img/02-arquitectura.png)

<sub>**Figura 2** · Los tres planos: señalización, medios y control · `02-arquitectura.png`</sub>

---

## Seguridad · lo que evita la factura sorpresa

- **Anti-flood** (`pike`): la ráfaga de registros se corta en el borde, antes de tocar la central.
- **IP ban automático**, con el país y el ISP de cada bloqueo.
- **Filtro de escáneres** (`secfilter`): sipvicious, friendly-scanner, sipcli y compañía quedan
  bloqueados de fábrica, por User-Agent y por patrón.
- **Antifraude**: límite de llamadas simultáneas (**CAC**) por troncal y por cliente, destinos
  prohibidos, ventanas horarias, corte de números de largo sospechoso.
- **Anti-loop y anti-inyección SIP**: dos clásicos que tumban centrales enteras.
- **TLS y SRTP** de punta a punta.
- **STIR/SHAKEN** disponible (verificación y firma del `Identity`), desactivado por defecto hasta que el operador lo pida.

![Seguridad en vivo](docs/img/03-seguridad.png)

<sub>**Figura 3** · IPs bloqueadas con su país, su ISP y el motivo del bloqueo · `03-seguridad.png`</sub>

---

## Operación

- **Troncales** con el operador: registro o por IP, UDP/TCP/TLS, códecs, DTMF, timers de sesión.
- **LCR y failover**: si el operador principal no contesta, la llamada sale por el siguiente.
- **Dispatcher**: balanceo entre varias centrales, con OPTIONS periódicos y latencia real.
- **Interfaces LAN y WAN**: el SBC tiene dos patas, y las dos se administran desde el panel.
- **Captura**: el diálogo SIP de cualquier llamada, mensaje por mensaje, y el pcap para Wireshark.
- **Test de troncal**: OPTIONS, registro y llamada de prueba, con el diagnóstico en criollo.
- **Multi-tenant**: varios clientes en el mismo SBC, cada uno con su realm, sus reglas y sus métricas.

![Interfaces LAN y WAN](docs/img/04-interfaces.png)

<sub>**Figura 4** · Las dos patas del SBC: estado del enlace, IP, tráfico y rutas · `04-interfaces.png`</sub>

![Troncales y operadores](docs/img/05-troncales.png)

<sub>**Figura 5** · Troncales con estado y latencia en vivo · `05-troncales.png`</sub>

![Topología](docs/img/06-topologia.png)

<sub>**Figura 6** · El mapa del borde: por dónde entra y por dónde sale cada llamada · `06-topologia.png`</sub>

![Diálogo SIP capturado](docs/img/07-captura-sip.png)

<sub>**Figura 7** · El flujo de una llamada, mensaje por mensaje: dónde se rompió y por qué · `07-captura-sip.png`</sub>

---

## Instalación

```bash
git clone https://github.com/flavioGonz/SBC-NG
cd SBC-NG
sudo ./install.sh
```

El instalador es interactivo: pregunta la **IP o dominio público** (o lo autodescubre por STUN), la
**red confiable** (tu LAN, exenta del anti-flood) y si ya tenés un **proxy inverso**. Después levanta
el stack con Docker Compose, **corre las migraciones solo**, genera los secretos y te imprime el
usuario del panel y el token de la API. El panel queda en `http://<tu-servidor>:3100`.

> ⚠️ **Ojo con el firewall.** Si abrís el 5060 pero no el rango RTP, la llamada entra, el teléfono
> suena, se atiende… y no se escucha nada. Es el error más común y el más confuso, porque la
> señalización funcionó perfecto. La matriz completa está en [docs/FIREWALL.md](docs/FIREWALL.md).

> 🔌 **Softphones WebRTC detrás de un proxy inverso (NGINX Proxy Manager):** además del panel, hay que
> publicar el WebSocket SIP con una `location /ws` que apunte al 8088 de Kamailio (el handshake debe
> responder **101**). El paso a paso está en el [Manual de Instalación](docs/manual/instalacion.md).

### Despliegue y actualización (appliance on-prem)

SBC-NG es un appliance: el código se **hornea en imágenes versionadas** y se despliega por pull/load,
no con `docker cp`. Para actualizar en producción:

```bash
git pull
cd docker
docker compose build          # o cargar las imágenes versionadas del release
docker compose up -d           # recrea sólo lo que cambió; las migraciones corren al arrancar
```

El panel se sirve desde la imagen `dashboard` (Next.js standalone) y el control-plane desde `control-plane`.
Un cambio de código que el usuario/admin note debe reflejarse en los **manuales** (`/manuales`).

---

## Enganchar tu central

SBC-NG no asume nada de lo que tiene detrás. Se le declara y listo:

```bash
curl -X POST http://tu-sbc:3100/api/v1/attach \
  -H "Authorization: Bearer $SBC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Mi central","sip_uri":"sip:192.168.1.10:5060","priority":10}'
```

Eso hace tres cosas de una: la anota como central, la agrega al **dispatcher** (para mandarle las
llamadas entrantes) y la suma a la lista de IPs confiables (para aceptar sus salientes).

PBX-NG lo hace solo desde su panel. Cualquier otra central se declara con ese `curl` o desde
**Centrales (attach)** en el panel.

![Central enganchada](docs/img/08-attach.png)

<sub>**Figura 8** · La central aparece en el dispatcher, con su estado y su latencia · `08-attach.png`</sub>

---

## Estándares

SBC-NG no inventa nada: implementa los RFC al pie de la letra.

| RFC | Qué |
|---|---|
| **3261** | SIP |
| **3263** | Localización de servidores SIP (NAPTR/SRV) |
| **3264** | Oferta/respuesta SDP |
| **3550 / 3551** | RTP |
| **3711** | SRTP |
| **4028** | Timers de sesión |
| **4733** | DTMF en RTP |
| **5389 / 8656** | STUN / TURN |
| **5763 / 5764** | DTLS-SRTP (lo que exige WebRTC) |
| **7118** | SIP sobre WebSocket |
| **8445** | ICE |
| **8224 / 8588** | STIR/SHAKEN (Identity) |

---

## Documentación

| | |
|---|---|
| 📖 **[Manuales](docs/manual/)** | Instalación, configuración, operación y **app de escritorio**, paso a paso. También **dentro del panel** (`/manuales`): se leen en pantalla, se exportan a PDF y las capturas se cargan pegando (Ctrl+V) sin recompilar |
| 🖥 **[App de escritorio (Windows)](docs/manual/escritorio.md)** | El **PBX-NG Softphone**: instalación `.exe`/`.msi`, WebRTC y SIP nativo, códecs, bandeja, atajos globales, click-to-call, auto-update |
| 🔌 **[API norte](docs/API.md)** | El contrato con la central |
| 🏗 **[Arquitectura](docs/ARQUITECTURA.md)** | Por qué está hecho así |
| 🔥 **[Puertos y firewall](docs/FIREWALL.md)** | La matriz completa, y el error del rango RTP |

---

## Estado del proyecto

| Versión | Qué trae |
|---|---|
| **0.1.0** | Base propia · control-plane con API norte · transcoding (Opus ↔ G.729) · multi-tenant · CAC · instalador |
| 0.2 | Panel propio · interfaces LAN/WAN · topología · test de troncal con diagnóstico · HEP/Homer |
| **0.3** | Motores Kamailio 6.1 + rtpengine mr13.5 · **STIR/SHAKEN** (verificación/firma, off por defecto) · **CAC** por troncal (dialog profiles) · SOC en vivo (banderas por país, bloqueos, timeline) · CDR propio del borde · notificaciones por email con plantillas · **manuales in-panel** (MD→HTML, capturas pegables) + **app de escritorio Windows** · diagnóstico de troncal con detección de SIP ALG · nombres de motor neutros en el panel |

---

<div align="center">
<br>
<sub>SBC-NG es un producto de <b>Infratec</b> · Montevideo, Uruguay</sub>
</div>
