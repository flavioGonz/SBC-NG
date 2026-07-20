# Manual de Configuración

Este manual asume que el borde ya está instalado y accedés al panel (ver *Manual de
Instalación*). Acá vas a **enganchar tus centrales**, **dar de alta troncales**,
**armar el ruteo** y **ajustar la defensa**. El orden importa: cada sección se apoya en la
anterior.

Una idea que conviene tener clara desde el principio: en el SBC **todo se configura desde
el panel**. No se toca un archivo, no se edita un `.env`, no se entra por SSH a cambiar
una IP. Si algo no se puede hacer desde el panel, es un bug, no una limitación de diseño.

---

## 1. Enganchar una central (attach)

» Señalización y Medios » Centrales (attach)

Una *central* es la PBX que el SBC protege. El SBC puede estar delante de una o de varias
a la vez (una PBX-NG y un 3CX conviviendo, por ejemplo). Enganchar una central es
decirle al borde: *"este equipo interno es de confianza, mandale las llamadas entrantes y
aceptá las salientes que venga de él"*.

Para agregar una central:

1. Tocá **Nueva central**.
2. **Nombre:** cómo la vas a reconocer (ej. `PBX-Central`).
3. **SIP URI:** la IP interna y puerto de la central (ej. `sip:192.168.10.5:5060`).
4. **Contexto entrante:** el contexto de dialplan al que entran las llamadas (por defecto
   `from-trunk`).
5. **Prioridad:** si hay varias centrales, cuál es la primaria.

![Formulario de alta de una central con SIP URI y prioridad](img/cfg-01-central-alta.png)

Apenas la guardás, el SBC empieza a **vigilarla con OPTIONS**: le manda un ping SIP cada
pocos segundos y mide si responde y en cuánto. Ese estado lo ves en la topología con un
temporizador de *"hace cuánto respondió"* y su latencia (ver *Manual de Operación*).

> **Qué hace esto por debajo:** el SBC agrega la IP de la central a su lista de *fuentes
> confiables* (para aceptar las llamadas salientes que origine) y a su *dispatcher* (para
> saber a quién entregarle las entrantes y monitorearla). Todo automático.

| Campo | Qué es | Ejemplo | Nota |
|---|---|---|---|
| **Nombre** | Etiqueta de la central | `PBX-Central` | Sólo para reconocerla |
| **SIP URI** | IP interna + puerto de la PBX | `sip:192.168.10.5:5060` | Debe ser alcanzable desde el SBC |
| **Contexto entrante** | Dialplan al que entran las llamadas | `from-trunk` | Dejá el default salvo que tu PBX use otro |
| **Prioridad** | Orden si hay varias centrales | `1` (primaria) | La menor gana; el resto queda de respaldo |

---

## 2. Troncales hacia los operadores

» Señalización y Medios » Troncales

Una *troncal* es el camino hacia el mundo: el operador de telefonía (VoIP provider),
otro SBC, o una sede remota. El SBC-NG maneja tres tipos, y el alta cambia según cuál
elijas.

### 2.1. Troncal por IP (peering)

El operador te reconoce por tu IP pública, sin usuario ni clave. Es el caso de un enlace
punto a punto o un troncal SIP corporativo.

- **Modo:** `IP`
- **Host del proveedor:** IP o dominio del operador (ej. `200.40.30.9`).
- **Transporte:** UDP, TCP o TLS.

### 2.2. Troncal con registro (usuario/clave)

El operador te da un usuario y una contraseña, y el SBC se **registra** contra él como si
fuera un teléfono. Es lo típico de un DID residencial o de PYME.

- **Modo:** `registro`
- **Host, usuario, contraseña** los da el operador.

El SBC mantiene el registro vivo y lo muestra en verde cuando está *Registrada*. Si la
clave está mal, ahora **no entra en loop**: reintenta con backoff creciente y te marca el
error en el estado, en vez de martillar al operador (esto se endureció en la última
versión).

![Alta de troncal, con el selector de modo IP / registro / WebRTC](img/cfg-02-troncal-modo.png)

### 2.3. Troncal WebRTC-cliente (interconexión de sedes)

Este es el troncal *marca de la casa*: conecta dos sedes por **WebSocket seguro (WSS)** en
vez de SIP tradicional, atravesando cualquier NAT sin abrir puertos en la sede remota. Lo
usa, por ejemplo, para unir dos SBC-NG de dos oficinas.

- **Modo:** `WebRTC-cliente`
- **URL remota:** el WSS del otro extremo (ej. `wss://sbc-sede-b.miempresa.com/ws`).
- **Usuario y clave** del enlace.

El SBC levanta el **wsbridge**: se conecta al WSS remoto, se registra, y hace de B2BUA
entre ese enlace y tu Kamailio local, con el audio anclado en rtpengine. En la topología
aparece un nodo WSS dibujado hacia su destino.

> **¿Cliente o servidor?** El extremo que *inicia* la conexión es el **cliente** (usa este
> modo). El extremo que *recibe* es el **servidor**: no configura una troncal saliente,
> sino que publica su `/ws` en el proxy (ver *Instalación → sección 6*) y da de alta al
> otro como una **extensión SIP** con clave. Para un enlace entre dos sedes, elegí una como
> servidor y la otra como cliente.

![Topología mostrando el troncal WebRTC dibujado entre dos sedes](img/cfg-03-troncal-webrtc.png)

### 2.4 Diagnóstico de una troncal

Al editar una troncal, el panel corre un **diagnóstico en vivo** que ocupa todo el sector derecho
del formulario, con un radar animado mientras prueba. No es un simple *ping*: encadena varias
comprobaciones y las interpreta.

- **Alcance SIP (OPTIONS):** manda un OPTIONS y mide si el operador responde y en cuánto.
- **Fallback TCP + ping:** si el operador **filtra OPTIONS** (típico de un Grandstream UCM o
  algunos operadores que sólo aceptan tráfico de llamada real), el SBC prueba **TCP al puerto SIP**
  y un **ping** antes de dar nada por muerto. Por eso un UCM sano se muestra en **ámbar
  informativo**, no en rojo de alarma: "no contesta OPTIONS" no es lo mismo que "está caído".
- **NAT / SIP ALG:** si detecta que la IP del operador queda **detrás de un gateway** o que hay un
  **SIP ALG** del router reescribiendo puertos, nombres o direcciones en la señalización, te lo
  avisa con la guía para desactivar el SIP ALG (es una de las causas más comunes de audio roto y
  registros que se caen solos).

> El SIP ALG del router de tu proveedor de Internet es el enemigo silencioso del VoIP: "ayuda"
> reescribiendo paquetes SIP y termina rompiéndolos. Si el diagnóstico lo marca, desactivalo en el
> router. El SBC ya hace bien ese trabajo; no necesita ayuda.

### 2.5 Referencia de campos de la troncal

| Campo | Qué es | Valores / ejemplo | Cuándo tocarlo |
|---|---|---|---|
| **Nombre** | Etiqueta interna de la troncal | `operador-antel`, `enlace-sedeB` | Siempre; es sólo para reconocerla |
| **Modo** | Tipo de troncal | `IP` · `registro` · `WebRTC-cliente` | Según cómo te reconoce el otro extremo |
| **Host del proveedor** | IP o dominio del operador/destino | `200.40.30.9`, `sip.operador.com` | Modos IP y registro |
| **Puerto** | Puerto SIP del destino | `5060` (UDP/TCP), `5061` (TLS) | Si el operador usa un puerto no estándar |
| **Transporte** | Protocolo de señalización | `UDP` · `TCP` · `TLS` | TLS si el operador lo exige o querés cifrar |
| **Usuario / Clave** | Credenciales de registro | las da el operador | Sólo modo `registro` |
| **URL remota (WSS)** | WebSocket seguro del otro SBC | `wss://sbc-b.empresa.com/ws` | Sólo modo `WebRTC-cliente` |
| **Máx. llamadas (CAC)** | Tope de llamadas simultáneas | `0` = sin límite; `10` = 10 canales | Para respetar el plan del operador y contener fraude |
| **Gateway / detrás de NAT** | IP del gateway si el operador está detrás de uno | IP del gateway | Lo sugiere el diagnóstico si lo detecta |

> **Regla práctica:** empezá con `Modo IP` o `registro` según lo que te dio el operador, dejá el
> resto por defecto, guardá, y mirá el diagnóstico. Ajustá sólo lo que el diagnóstico marque.

---

## 3. Ruteo de salida

» Señalización y Medios » Ruteo de salida

Las troncales son los caminos; el ruteo decide **cuál** se usa según el número marcado. Es
una tabla de patrones con prioridad y failover.

1. Tocá **Nueva ruta**.
2. **Patrón:** una expresión que matchea el número (ej. `^09[0-9]{7}$` para celulares
   uruguayos, `^0` para todo lo que empiece con 0).
3. **Troncal:** a qué troncal mandarla.
4. **Quitar / anteponer:** dígitos a sacar del principio o prefijo a agregar
   (normalización de numeración).
5. **Prioridad:** si dos rutas matchean, gana la de menor prioridad; la otra queda de
   *failover* si la primera no contesta.

![Tabla de ruteo de salida con patrones y troncales](img/cfg-04-ruteo.png)

| Campo | Qué es | Ejemplo |
|---|---|---|
| **Patrón** | Expresión que matchea el número marcado | `^09[0-9]{7}$` (celular UY) · `^0` (todo lo que empieza con 0) |
| **Troncal** | A qué troncal se manda si matchea | `operador-antel` |
| **Quitar** | Dígitos a sacar del principio | `1` (saca el 0 de acceso) |
| **Anteponer** | Prefijo a agregar | `598` (E.164) |
| **Prioridad** | Orden ante varios matches | menor gana; el resto es failover |

El SBC prueba las troncales en orden hasta que una conteste. Si un operador está caído, el
INVITE salta al siguiente automáticamente — y con un **tope de saltos** para que una
troncal inalcanzable nunca haga crecer el mensaje ni cuelgue la llamada (endurecido en la
última versión).

### 3.1 El asistente de ruteo (paso a paso)

Para no equivocarte con las expresiones, **Nueva ruta** es un asistente. Primero elegís **cómo**
querés rutear, con ejemplos, y recién después cargás los datos:

- **Atrapa-todo:** todo lo que se marque sale por una troncal. El caso más simple.
- **Por prefijo:** según con qué empieza el número (ej. todo lo que empieza con `0` → operador
  nacional; `00` → internacional → otra troncal).
- **Código puntual:** un número o código exacto va a un destino fijo (ej. marcar `1` → mesa de
  ayuda).

El asistente muestra un **diagrama animado** del flujo ("al marcar *X* → SBC → troncal") para que
veas el camino antes de guardar. Debajo, la normalización (quitar/anteponer dígitos) se explica
con el ejemplo en vivo del número que escribís.

### 3.2 Tope de llamadas por troncal (CAC)

Cada troncal puede tener un **máximo de llamadas simultáneas** (*Call Admission Control*). Sirve
para dos cosas: **respetar lo que te vende el operador** (si tu plan son 10 canales, no tiene
sentido intentar 15) y **contener el fraude** (si una credencial se filtra, el tope pone un techo
al daño).

- En la troncal, poné **Máx. llamadas**. `0` o vacío = sin límite.
- Cuando la troncal llega al tope, la siguiente llamada recibe un **503 (ocupado)** y, si hay una
  ruta de *failover*, salta a la troncal alternativa.
- El conteo lo lleva el borde en tiempo real; no depende de que el operador te avise.

> El CAC trabaja junto con el failover del ruteo: "esta troncal está llena → probá la siguiente".
> Bien combinados, ninguna llamada se pierde por un tope mientras haya una salida libre.

---

## 4. Extensiones SIP remotas

» Señalización y Medios » Extensiones SIP

Un teléfono o softphone que está **fuera de la red** (un empleado en su casa, un celular)
puede registrarse a través del SBC en vez de exponer la central. El SBC recibe el
REGISTER, lo valida contra la central, y de ahí en más hace de intermediario: el teléfono
solo conoce al SBC, nunca a la PBX.

Cada extensión remota lleva **usuario y clave propios**. La numeración se asigna de forma
**correlativa y segura** desde el panel — no hay que pensar el próximo número, el SBC lo
propone.

> **Seguridad:** registrarse exige la clave. Un atacante que adivine el número de
> extensión no logra nada sin la contraseña: el SBC lo desafía con *digest auth* y, si
> falla, lo cuenta como intento sospechoso (ver sección 7).

![Lista de extensiones SIP remotas con su estado de registro](img/cfg-05-extensiones.png)

> **Para el usuario remoto:** el teléfono que registra esta extensión desde una PC con Windows es el
> **PBX-NG Softphone**. Cómo instalarlo, configurarlo (WebRTC contra el `/ws` del borde o SIP
> nativo), y resolver problemas está en el *Manual de la App de Escritorio (Windows)*.

### 4.1 Dos modelos de registro: proxy vs. registrar del borde

Hay **dos formas** en que un teléfono remoto llega a través del SBC, y son excluyentes por instalación:

| | **Proxy de registro** (por defecto) | **Registrar del borde** (opcional) |
|---|---|---|
| Quién autentica | La central (PBX) | El **SBC** (digest local) |
| Dónde viven las credenciales | En la central | En el SBC (tabla `subscriber`) |
| Qué ve la central | Todos los REGISTER | Nada: el SBC los termina |
| Cuándo conviene | Caso normal, la central manda | Descargar la PBX, sobrevivir a que se caiga, o no exponerla |
| Dónde se administra | Extensiones SIP (sección 4) | **Registros → Registrar del borde** |

En **proxy** (lo que está activo de fábrica) el SBC recibe el REGISTER, le arregla el NAT y se lo
pasa a la central; si contesta 200, la extensión queda arriba. La lista de *Registros* muestra lo
que el borde **vio pasar**.

### 4.2 Registrar del borde (terminar el REGISTER en el SBC)

» Monitoreo » Registros » Registrar del borde

Cuando activás el **registrar del borde**, los teléfonos registran **contra el SBC**, que los
autentica por *digest* contra credenciales locales — la central deja de ver esos REGISTER. Es un
cambio de modelo, por eso viene apagado y se enciende con intención.

**Para ponerlo en marcha:**

1. En **Registros → Registrar del borde**, prendé el switch y fijá el **Realm** (el dominio de
   autenticación, ej. `sbc.tuempresa.com`). El realm entra en el cálculo del digest: si lo cambiás
   después, las claves ya creadas dejan de validar.
2. Tocá **Aplicar al motor**. El SBC regenera la config, la **valida** y recarga con *rollback*
   automático (si algo no levanta, vuelve solo a la config anterior).
3. Creá una **cuenta SIP** por teléfono: usuario + clave. La clave se guarda como `ha1` (nunca en
   claro).
4. En cada teléfono, apuntá el SIP **al SBC** (no a la central) con ese usuario, clave y realm.

| Campo | Qué es | Ejemplo |
|---|---|---|
| **Switch ON/OFF** | Activa el registrar del borde | ON |
| **Realm** | Dominio de autenticación (digest) | `sbc.tuempresa.com` |
| **Usuario** | Nombre de la cuenta SIP | `1010` |
| **Clave** | Contraseña (se guarda como ha1) | mínimo 4 caracteres |
| **Descripción** | Nota libre | `Softphone recepción` |

> **Todo o nada.** Con el registrar activo, **todo** REGISTER que llega al SBC se termina ahí. Los
> teléfonos deben usar las credenciales del SBC, no las de la central. Si algunos necesitan seguir
> registrando contra la PBX, dejá el registrar **apagado** y usá el modo proxy.

> **Medios cifrados:** si el softphone ofrece audio SRTP (`RTP/SAVP` + `a=crypto`), el SBC hace el
> puente a RTP plano hacia la central automáticamente (interworking SRTP↔RTP en rtpengine). No hay
> nada que configurar; ver sección 6.

---

## 5. Manipulación de cabeceras SIP

» Señalización y Medios » Manipulación SIP

A veces un operador es quisquilloso: quiere el CallerID en un formato, rechaza un
`User-Agent`, exige un prefijo. En vez de tocar la central, se arregla en el borde. Esta
pantalla te deja escribir reglas de reescritura que el SBC aplica a la señalización que
sale (o entra), sin recompilar nada.

Las reglas se guardan en la base y el control-plane las traduce a la configuración de
Kamailio automáticamente. Si no hay reglas, el mensaje pasa tal cual.

Casos típicos que se resuelven acá sin tocar la central:

| Lo que exige el operador | Qué hace la regla |
|---|---|
| Un CallerID en formato E.164 (`+598…`) | Reescribe el `From` anteponiendo el prefijo del país. |
| Rechaza tu `User-Agent` | Reemplaza el `User-Agent` por uno neutro que el operador acepte. |
| Quiere un dominio propio en el `From` | Cambia el host del `From` por el que te asignó el operador. |
| Manda un `P-Asserted-Identity` que tu central no entiende | Lo elimina o lo traduce al `From`. |

![Editor de reglas de manipulación SIP](img/cfg-06-manipulacion.png)

---

## 6. Medios: rtpengine, TURN y STUN

» Señalización y Medios » Medios · TURN/STUN

El SBC no solo mueve la señalización: **ancla el audio**. Todo el RTP pasa por rtpengine,
que resuelve el NAT de medios (el problema clásico de *"la llamada conecta pero no hay
audio"*) y, cuando hace falta, **transcodifica** entre códecs distintos (G.729 ↔ Opus ↔
G.711).

Desde esta pantalla configurás el rango de puertos de medios y el comportamiento del
transcoding. El servidor **TURN/STUN (coturn)** es el que permite que los softphones
WebRTC detrás de NAT tengan audio: se configura acá con su clave compartida.

Para verificar que el TURN realmente funciona (no solo que el puerto está abierto), el
repositorio trae `scripts/check-turn.py`, que hace un *Allocate* real contra el servidor.

![Panel de medios con rango RTP y configuración de TURN](img/cfg-07-medios.png)

**Interworking de cifrado (SRTP ↔ RTP).** rtpengine traduce entre medios cifrados y en claro sin que
tengas que configurar nada:

| Escenario | Qué hace el SBC |
|---|---|
| Teléfono ofrece **SDES-SRTP** (`RTP/SAVP` + `a=crypto`) por UDP | Termina el SRTP y ofrece **RTP/AVP** a la central; re-cifra hacia el teléfono |
| Softphone **WebRTC** (WS/WSS, `RTP/SAVPF` + DTLS) | Quita ICE y desencripta DTLS-SRTP; entrega RTP plano a la central |
| Oferta ya en **RTP/AVP** | No toca nada (no-op) |

> Sin este puente, una central que sólo habla RTP plano (Asterisk sin SRTP en ese endpoint) rechaza
> el audio cifrado con un **488 Not Acceptable Here**. El SBC lo resuelve en el borde.

| Campo | Qué es | Valor típico |
|---|---|---|
| **Rango de puertos RTP** | Puertos UDP para el audio anclado | `30000-40000` |
| **TURN: clave compartida** | Secreto del coturn para WebRTC | generado en la instalación |
| **Transcoding** | Traducir entre códecs (G.729↔Opus↔G.711) | automático según oferta |

---

## 7. Seguridad y detección de intrusiones (IDS/SOC)

» Diagnóstico » Intrusion Detection

Esta es la pantalla que justifica tener un SBC. Todo lo que golpea el 5060 desde internet
—escáneres, fuerza bruta de registro, intentos de fraude a números caros— pasa por acá, y
el SBC lo frena en el borde. La pantalla es un **panel tipo SOC**: banderas por país,
bloqueos activos, ataques en curso, mitigaciones y un historial.

Tres capas de defensa trabajan solas desde el primer arranque:

- **pike + ipban:** quien manda demasiados mensajes en poco tiempo (una avalancha) queda
  bloqueado por un rato. A una IP ya bloqueada, el SBC ni le contesta.
- **secfilter:** tira de una los escáneres conocidos por su *User-Agent* (sipvicious,
  friendly-scanner) y las IPs de tu lista negra.
- **detectores de fraude:** un INVITE de afuera que intenta marcar a la PSTN o a un número
  larguísimo (typical toll-fraud) se descarta y la IP se banea.

En la pestaña **Ajustes** definís los umbrales: cuántos mensajes tolera una IP, en qué
ventana, y por cuánto tiempo la bloqueás. En **Listas** administrás las listas negra y
blanca a mano.

![Panel SOC con banderas de país, bloqueos y timeline de ataques](img/cfg-08-soc.png)

> **Importante:** los umbrales de fábrica ya protegen. No hace falta tocar nada para estar
> defendido; los ajustes son para afinar, no para activar.

**Indicador "bajo ataque".** Cuando el ritmo de eventos de seguridad del último minuto pasa el
umbral, el panel muestra un **banner rojo pulsante** arriba de todo, con los eventos/min, cuántas
IPs y la que más golpea. Es informativo: las mitigaciones (anti-flood + ipban) ya están actuando
solas; el banner sólo te avisa que está pasando ahora.

**Motivo de cada bloqueo.** En *Bloqueos activos*, la columna **Motivo** muestra con un ícono y un
tooltip por qué cayó cada IP: flood, escáner, auth fallida, fraude o **país no permitido**. Cada
fila tiene además un botón para **banear** esa IP (o el país entero) desde el propio SOC.

### 7.2 Filtro por país (GeoIP)

» Seguridad » Filtro por país

Con el módulo **geoip2** activo, el borde decide qué países pueden hablar SIP con él, **antes** de
tocar la central. Hay dos modos:

| Modo | Qué hace | Cuándo usarlo |
|---|---|---|
| **Lista negra** | Rechaza (403) el SIP de los países de la lista; la IP cae en la lista negra con su bandera | Bloquear focos de ataque puntuales (ej. países desde donde te escanean) |
| **Lista blanca** | Sólo entra el SIP de los países de la lista; **todo el resto se rechaza** | Cuando tu telefonía es de un país o dos y todo lo demás sobra |

Pasos: activá **geoip2** en *Motor SIP → Módulos*, elegí el modo, agregá los países (con su bandera)
y tocá **Guardar y aplicar**. En lista blanca, los países que geoip no puede ubicar se **dejan
pasar** a propósito, para no bloquear a alguien por error (el resto de defensas igual actúa sobre
ellos).

> **Ojo con la lista blanca:** si te olvidás de incluir tu propio país, te podés dejar afuera a vos
> mismo. Agregá primero el país de tus centrales y operadores, aplicá, y recién después endurecé.

### 7.1 STIR/SHAKEN (verificación de identidad del llamante)

El SBC trae soporte de **STIR/SHAKEN**: el estándar que firma criptográficamente el CallerID para
combatir el *spoofing* (llamadas que mienten sobre quién llama). Cuando está activo, el borde
**verifica la cabecera `Identity`** de los INVITE entrantes y puede **firmar** los salientes con tu
clave y certificado.

> **Estado de fábrica: desactivado.** STIR/SHAKEN se dejó **apagado a propósito**. Su compatibilidad
> depende del operador —muchos en la región todavía no lo implementan— y activarlo sin que el otro
> extremo lo soporte no aporta nada. Queda ahí, listo para el día que tu operador lo pida, y se
> enciende desde el panel sin tocar código. Si no sabés si lo necesitás, no lo necesitás: dejalo como
> está.

---

## 8. Red: LAN, WAN e IP pública

» Infraestructura » Red (LAN/WAN)

El SBC muestra sus placas de red reales con un conector RJ45 animado que indica si el
enlace está arriba. Debajo del diagrama de modo ves las interfaces con su IP, máscara y
tráfico.

La **IP pública** es clave para que Kamailio anuncie la dirección correcta en las
cabeceras (Via, Record-Route) y el audio no se pierda. Se resuelve de tres maneras, y el
SBC elige la que configuraste en la instalación:

- **IP fija:** la ponés y listo.
- **Dominio (DDNS):** el SBC lo resuelve y **re-resuelve** si la IP cambia, regenerando
  coturn y rtpengine solo.
- **Autodescubrimiento por STUN:** si no sabés tu IP pública, el SBC se la pregunta a un
  servidor STUN y la vigila; si cambia, se reconfigura.

![Pantalla de Red con las interfaces LAN/WAN y el RJ45 animado](img/cfg-09-red.png)

---

## 9. Notificaciones por email

» Infraestructura » Ajustes · Email

Para que el borde te avise (un motor caído, un ataque, un troncal que se desregistró),
configurá el SMTP: servidor, puerto, usuario, clave y remitente. La contraseña se guarda
cifrada y nunca se devuelve al panel. Hay un botón de **prueba** que manda un mail de
verificación.

![Configuración SMTP para notificaciones](img/cfg-10-email.png)

---

## 10. Orden recomendado de puesta a punto

Si es tu primera vez, seguí esta secuencia y vas a tener un borde funcional sin volver
atrás:

1. **Red** — confirmá que la IP pública es la correcta.
2. **Centrales** — enganchá tu PBX y verificá que la ves en verde.
3. **Troncales** — dá de alta el operador y esperá que registre / responda OPTIONS.
4. **Ruteo** — armá al menos una ruta de salida.
5. **Extensiones** — si tenés usuarios remotos, creá sus registros.
6. **Seguridad** — revisá el SOC, ajustá umbrales si hace falta.
7. **Email** — dejá las notificaciones andando.

Con eso el borde está en producción. El día a día —mirar, diagnosticar, responder a un
incidente— es el **Manual de Operación**.
