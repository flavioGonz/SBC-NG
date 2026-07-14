# Changelog · SBC-NG

## [0.1.0] — 2026-07-14

Primera versión como producto independiente. SBC-NG se separa de PBX-NG y **arranca solo**: se pone
delante de la central que sea (PBX-NG, 3CX, FreePBX, Issabel, un Asterisk propio).

### El corte

- **Base de datos propia** (`sbcng`). El SBC ya no comparte **ni una tabla** con la central. Antes,
  su agente entraba con `psycopg2` a la base de PBX-NG y leía `dispatcher`, `secfilter` y `htable`
  de ahí: mientras eso siguiera así, ninguno de los dos se podía instalar, versionar ni vender por
  separado.
- **Muere el bus por tabla.** La central le dejaba "recados" al SBC insertando filas en
  `pbxng_sbc_cmd` y un agente hacía polling. Ahora el control-plane le habla a **Kamailio por RPC**
  (jsonrpc en `/RPC`) y a **rtpengine por su protocolo ng** (bencode sobre UDP). Es sincrónico: se
  sabe si el comando funcionó.
- **Ninguna central cableada por IP.** En la config vieja, la saliente se reconocía con
  `src_ip == <IP de la única central>`. Ahora es `allow_source_address("1")` contra la tabla
  `address`, que llena el **attach**. Por eso el SBC puede estar delante de dos centrales distintas
  a la vez.

### Agregado

- **Control-plane** con la API norte: `attach`, `status`, `metrics`, `trunks`, `security`,
  `registrations`. Auth doble (token Bearer para las centrales, JWT para el panel) y deny-by-default.
- **rtpengine con transcoding**: se compila con ffmpeg + bcg729, así que habla G.711, G.722, Opus y
  **G.729**. Es lo que permite meter un softphone WebRTC (Opus) contra un operador que sólo habla
  G.729 — sin eso, esa llamada devuelve 488 y no existe.
- **Multi-tenant** desde el esquema (`tenant_id` en todas las tablas) y **CAC** (límite de llamadas
  por troncal y por cliente).
- Campos de troncal que antes estaban escondidos en el código: transporte (UDP/TCP/TLS), DTMF
  (RFC 4733 / inband / INFO), timers de sesión (RFC 4028), códecs, from-user y from-domain.
- Seguridad de fábrica: anti-flood (pike), IP ban con autoexpire, `secfilter` sembrado con los
  User-Agent de los escáneres conocidos, anti-loop, corte de toll-fraud y de inyección SIP.
- **Instalador propio**: levanta el borde completo, migra la base, genera los secretos y te imprime
  el `curl` del attach. No instala ninguna central.
- Documentación: [API norte](docs/API.md), [arquitectura](docs/ARQUITECTURA.md) y
  [firewall](docs/FIREWALL.md).

### Notas de la migración de Kamailio

- La tabla `version` se siembra en la migración `0002`. Kamailio verifica la versión de cada tabla
  que abre y, si no la encuentra, **no arranca** — y el error no dice eso.
- `uacreg` va en **v5** (con `socket` y `contact_addr`). Con la v4, el módulo `uac` falla la consulta
  y las troncales con registro nunca levantan.

### Pendiente para 0.2

- Panel propio (hoy se administra por API).
- Transcoding activable **por troncal** desde el panel (hoy el motor ya lo soporta).
- Módulo de test de troncal: OPTIONS, captura y diagnóstico en criollo.
- HEP/Homer para captura centralizada.
- Migrador de datos desde una instalación PBX-NG existente.
