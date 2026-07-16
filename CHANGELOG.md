# Changelog · SBC-NG

## [0.3.0] — 2026-07-16

Endurecimiento, más motor y presentación de producto.

### Motor
- **Kamailio 6.1.3** (desde 5.6) y **rtpengine mr13.5** (desde mr11): nuevas deps, imágenes `:pre6x` para rollback.
- **STIR/SHAKEN** (`secsipid`): verificación del header `Identity` en INVITE entrante y firma configurable — **desactivado por defecto** (gated por `#!ifdef`, cero riesgo hasta que el operador lo pida).
- **CAC por troncal**: tope de llamadas simultáneas (dialog profiles + `dr_gateways.attrs`), 503 al pasarse.
- **wsbridge**: backoff en fallo de auth (evita loop de REGISTER); fix del INVITE saliente a troncal inalcanzable.

### Panel
- **Resumen** rediseñado como tablero de operaciones: contenedores (CPU/mem/uptime), recursos del appliance, KPIs, interfaces, troncales e internos registrados.
- **SOC en vivo** (`/seguridad`): banderas por país, bloqueos, ataques, timeline, mitigaciones, historial (socket.io).
- **CDR propio del borde** expuesto en el panel.
- **Notificaciones por email** con plantillas HTML por tipo de evento y logo embebido (CID).
- **Diagnóstico de troncal** con fallback TCP+ping (Grandstream/UCM = ámbar informativo) y **detección de SIP ALG**.
- **Topología** con rutas de salida/entrada (toggle) y troncal detrás del gateway.
- **/red**: el diagrama refleja placas caídas/desconectadas/deshabilitadas (atenuadas + X, sin flujo).
- **Wizards** de troncal y de ruteo de salida (paso a paso, animados).
- **Nombres de motor neutros** en las pantallas cliente: Kamailio → *Motor SIP*, coturn → *TURN Server*, rtpengine → *motor de medios* (no se revela el stack de base).

### Documentación
- **Manuales propios in-panel** (`/manuales`): Markdown → HTML profesional, exportable a PDF, con **carga de capturas pegando** (Ctrl+V) al volumen persistente, sin recompilar.
- **Manual de la App de Escritorio (Windows)** — el PBX-NG Softphone (instalación `.exe`/`.msi`, WebRTC/SIP nativo, códecs, bandeja, atajos globales, click-to-call, auto-update).

## [0.2.0] — 2026-07-14

El SBC deja de administrarse por `curl`: tiene panel propio, y lo que el panel dice que hace, lo hace.

### Panel

- **Panel web** con el mismo lenguaje visual que PBX-NG (un técnico que sabe usar uno se maneja en el
  otro sin aprender nada): Resumen, Topología, Centrales, Troncales, Reglas SIP, Registros SIP, Red,
  Medios y Seguridad.
- **Primer arranque sin contraseña de fábrica.** No hay `admin/admin`: la primera vez el panel pide
  crear el administrador y la contraseña la elige el dueño. La puerta se cierra sola (409 apenas
  existe un usuario). La mitad de los SBC comprometidos del mundo son un admin/admin que nadie cambió.
- **Modos de red: router o switch.** En router, el SBC es la frontera (WAN a internet, LAN a la
  central, NAT y ruteo). En switch, puentea sus placas en capa 2 y se hace transparente. Antes de
  aplicar se muestra el **plan**: los comandos exactos que se van a correr, porque cambiar el modo de
  red puede cortar la sesión del propio panel.
- **Sin servidor DHCP, y es a propósito.** Un SBC no es el router de la oficina: si además repartiera
  direcciones, el día que se enchufa en la red del cliente le pisa el DHCP que ya estaba.
- **Interfaces con estado real**: el RJ45 se pinta desde `/sys` (verde con enlace, rojo sin cable),
  no desde lo que alguien anotó una vez.
- **Reglas SIP** desde el panel: quitar, agregar o modificar cabeceras, forzar From-user, PAI, PPI y
  Diversion, por troncal o para todas. Se traducen a un fragmento de Kamailio y se aplican. Se acabó
  editar el `kamailio.cfg` con `vi` en cada alta de troncal.
- **Centrales editables**: la central vive en tres lugares (`sbc_pbx`, `dispatcher` y `address`);
  editarla o sacarla rehace los tres **juntos**, para que el panel no muestre una IP y el motor use otra.

### Corregido (cosas que prometían y no cumplían)

- Los umbrales de **Seguridad** (pike, duración del bloqueo, secfilter, TLS obligatorio) ahora llegan
  de verdad al motor: el `kamailio.cfg` importa el fragmento que genera el panel, en vez de tener los
  valores clavados. Antes, "Aplicar" reiniciaba Kamailio y Kamailio volvía con los valores de fábrica.
- Se sacaron del panel el **bloqueo por país** y el contador de **registros fallidos**: no había nada
  detrás. Un panel con perillas que no mueven nada es peor que un panel sin esas perillas.
- Se sacaron los switches globales de **transcoding** y **SRTP** de Medios: el transcoding lo decide
  cada troncal (sus códecs) y el SRTP se activa solo cuando una punta es WebRTC. Ahora la pantalla lo
  explica en vez de simular un control.
- `jsonrpcs transport` pasa a **7**: con 6 el módulo carga pero no inicializa el RPC sobre HTTP, y el
  panel veía el SBC "sin respuesta" aunque el SIP funcionara.
- Una `route` de Kamailio **no puede tener el cuerpo vacío**: el generador de reglas emitía un bloque
  con sólo un comentario y el motor no arrancaba. Quedarse sin reglas dejaba el borde mudo.
- El **TURN** ya no muere en bucle cuando no está configurado: queda en espera. Antes reventaba, el
  panel mostraba "detenido" como si algo estuviera roto y, al aplicar la config, no había contenedor
  que reiniciar.
- Las **migraciones corren solas al arrancar**. Un appliance no puede depender de que alguien se
  acuerde de correr `npm run migrate` después de actualizar.

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
