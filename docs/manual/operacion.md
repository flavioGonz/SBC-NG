# Manual de Operación

El borde ya está configurado y pasando llamadas. Este manual es para el día a día: **mirar
que todo esté sano, diagnosticar cuando algo se tuerce, y responder a un ataque**. Está
pensado para un operador o un NOC, no para quien lo instaló.

La regla de oro del SBC: si algo no anda, la respuesta casi siempre está en el panel antes
que en un SSH. Aprender a leer estas cinco pantallas te ahorra el 90% de los sustos.

---

## 1. La mirada de la mañana

» Monitor » Resumen

Es la portada, y es un **tablero de operaciones** real, no un adorno. De un vistazo te dice si el
borde está sano. Lo que vas a encontrar, de arriba hacia abajo:

- **KPIs del momento:** llamadas activas, internos registrados, llamadas transcodificando y IPs
  bloqueadas. Son los cuatro números que resumen "cómo viene el borde ahora mismo".
- **Recursos del appliance:** CPU, memoria y disco en anillos, con el valor real (carga, GB
  usados/totales) y el *uptime*. Si el disco se acerca al tope o la carga se dispara, se ve acá.
- **Contenedores del stack:** cada motor (kamailio, rtpengine, coturn, wsbridge, control-plane,
  base) con su **estado**, su **CPU %**, su **memoria** y su tiempo en marcha. Es el chequeo de
  salud de cada pieza en una sola tabla.
- **Interfaces de red:** cada placa con su IP y su tráfico.
- **Troncales:** el estado en vivo de cada una (respuesta a OPTIONS).
- **Internos registrados:** quién está en línea, con su IP y su transporte.
- **Últimas llamadas:** las más recientes del CDR (de→a, resultado, duración, hora).

Si algo está en rojo o ámbar, empezá por acá: en el 90% de los casos, el tablero ya te dice qué
pieza mirar antes de abrir cualquier otra pantalla.

![Panel Resumen con KPIs, recursos, contenedores, interfaces, troncales y últimas llamadas](img/ope-01-resumen.png)

---

## 2. La topología en vivo

» Monitor » Topología

El mapa del borde: el SBC en el centro, las centrales enganchadas, las troncales hacia los
operadores y el gateway. No es un dibujo estático — **late con datos reales**:

- Cada central y cada troncal muestra un **temporizador** de hace cuánto respondió su
  último OPTIONS. Si el número deja de subir con normalidad, ese enlace se está muriendo.
- Muestra la **latencia** medida (ida y vuelta del OPTIONS) y un **MOS** estimado (Mean
  Opinion Score): una nota de 1 a 5 de la calidad de audio esperable en ese enlace.
- Las llamadas en curso se dibujan animadas sobre los enlaces por donde pasan.

Un MOS por encima de 4 es excelente; entre 3.5 y 4 es aceptable; por debajo de 3.5 el
audio se va a notar, y conviene revisar la red hacia ese operador.

![Topología con temporizadores de OPTIONS, latencia y MOS por enlace](img/ope-02-topologia.png)

---

## 3. Transcoding en vivo

» Monitor » Transcoding

Cuando dos extremos de una llamada hablan códecs distintos, el SBC transcodifica en el
medio. Esta pantalla lo muestra **mientras pasa**: el origen y el destino, los códecs de
cada lado, y una animación del flujo de audio cuando efectivamente hay conversión. Un
*badge* se enciende cuando hay transcoding activo.

Sirve para dos cosas: confirmar que una llamada problemática está transcodificando (lo que
consume CPU) y ver, en una integración nueva, qué códec terminó negociando cada lado.

![Pantalla de Transcoding mostrando origen, códecs y la animación del flujo](img/ope-03-transcoding.png)

---

## 4. El registro de llamadas (CDR)

» Monitor » CDR del borde

El borde **emite su propio CDR** — no depende del de la central. Cada llamada que cruza el
SBC queda registrada con origen, destino, hora, duración y resultado. Es la fuente de
verdad para facturación, disputas y auditoría, porque registra lo que *realmente* pasó por
el borde, no lo que la central *creyó* que pasó.

**Qué te dice cada fila, además de lo obvio:**

- **De dónde vino**: la bandera del país de la IP origen y el ISP. Las llamadas que vienen de
  tu red interna o de la central se marcan con un ícono de servidor en vez de bandera.
- **Si esa IP está bloqueada** ahora mismo en el borde: la fila se pinta en rojo suave y lleva
  un distintivo. Sirve para responder rápido *"¿este atacante llegó a cursar algo?"*.
- **Qué significa el resultado**: pasá el mouse por el estado y el panel te explica el código
  SIP en criollo. No hace falta saberse la RFC de memoria.

**Los filtros** son por período (hoy, 7 días, 30 días, todo, o un rango a medida) y por estado
(todas, atendidas, no atendidas, o **sólo las que vienen de una IP bloqueada**). Arriba se ve el
**ASR** — qué porcentaje de los intentos terminó atendido — que es el número que primero mira
cualquiera que audite tráfico.

> **Sobre el ASR.** Un ASR muy bajo casi siempre significa una de tres cosas: números mal
> normalizados en el ruteo, una troncal con problemas, o alguien escaneando. El CDR filtrado por
> *no atendidas* te dice cuál de las tres es en menos de un minuto.

### 4.1 Los códigos que más vas a ver

| Código | Qué pasó realmente | Por dónde empezar |
|---|---|---|
| **200** | Atendida | — |
| **404** | El destino no existe donde llegó la llamada | El número marcado o el ruteo: ¿la central tiene esa extensión? |
| **403** | Rechazada por política | IP no permitida, país bloqueado, o credenciales sin permiso |
| **408** | Nadie respondió la señalización | El destino está caído o inalcanzable |
| **486** | Ocupado | El destino estaba en otra llamada |
| **487** | Cancelada antes de atender | Colgaron, o hubo failover a otra troncal |
| **488** | **No hubo medios en común** | Códecs o cifrado incompatibles — ver la sección 5.1 |
| **503** | Sin capacidad | Troncal llena (CAC) u operador caído |

![CDR del borde con columnas de origen, destino, duración y resultado](img/ope-04-cdr.png)

---

## 5. Diagnóstico profundo: captura SIP

» Diagnóstico » Captura SIP

Cuando una llamada falla y el CDR no alcanza, esta es la navaja suiza. El SBC tiene un
**sniffer SIP permanente**: captura toda la señalización que entra y sale, y la guarda en
un anillo. No hay que correr un tcpdump a mano ni llegar a tiempo — ya está grabado.

- Buscá por número, IP, Call-ID o método.
- Abrí un diálogo y velo como una **escalera SIP** (ladder): quién le mandó qué a quién,
  en orden, con los tiempos.
- Si la llamada tuvo audio grabado, hay un **reproductor** en el mismo drawer.

Con esto reconstruís exactamente qué pasó: dónde se cortó, quién mandó el BYE, por qué el
operador respondió 486.

![Captura SIP con el buscador y la escalera de un diálogo abierto](img/ope-05-captura.png)

### 5.1 Caso real: "la llamada conecta y corta con 488"

Vale la pena contarlo entero porque es el tipo de problema que más tiempo hace perder, y el
método sirve para cualquier otro.

**El síntoma.** Un interno marca, y la llamada muere enseguida con **488 Not Acceptable Here**.
No es que no encuentre el destino (eso sería 404) ni que esté ocupado (486): el otro lado dice
*"no puedo con los medios que me ofrecés"*.

**Cómo se diagnostica.** El CDR te da el código, pero no el porqué; eso está en el **SDP** (la
parte del mensaje que describe el audio). Buscá el INVITE en la captura SIP y abrilo: en el
cuerpo vas a ver algo así:

```
m=audio 44796 RTP/SAVP 0 8 101
a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:AXm7rYMwiEuf8qQ...
a=rtpmap:0 PCMU/8000
```

Las dos líneas que importan: **`RTP/SAVP`** y **`a=crypto`** significan que ese teléfono está
ofreciendo **audio cifrado (SRTP)**. Si del otro lado hay una central que sólo habla RTP en
claro, no hay acuerdo posible y contesta 488.

**Qué hace el SBC.** Justamente esto es lo que resuelve un borde: rtpengine **termina** el
cifrado del lado del teléfono y le ofrece RTP plano a la central, traduciendo en el medio. No
hay nada que configurar — pero si ves 488 con `a=crypto` en el SDP, ya sabés que el problema es
de **cifrado de medios**, no de códecs ni de ruteo.

**El método, en general.** Ante cualquier fallo de medios:

1. Mirá el **código** en el CDR (te dice la familia del problema).
2. Abrí el **INVITE** en la captura y leé el `m=audio`: el perfil (`RTP/AVP` en claro,
   `RTP/SAVP` cifrado, `RTP/SAVPF` WebRTC) y los códecs ofrecidos.
3. Compará con lo que el otro extremo respondió. La incompatibilidad casi siempre salta a la
   vista en esas dos líneas.

---

## 6. Responder a un ataque

» Diagnóstico » Intrusion Detection

El SBC se defiende solo, pero como operador tenés que **saber leer un ataque** y actuar si
hace falta.

Qué vas a ver en el SOC durante un ataque típico:

- El aviso **BAJO ATAQUE** arriba de todo: aparece solo cuando el ritmo de eventos del último
  minuto pasa el umbral, y muestra cuántos eventos por minuto, desde cuántas IPs, y cuál es la
  que más golpea. Es informativo — las defensas ya están actuando solas.
- Un pico de **bloqueos** con la bandera del país de origen, y en la columna **Motivo** el ícono
  de qué lo frenó: flood, escáner, auth fallida, fraude o país no permitido.
- En el **mapa de ataques**, un punto pulsante por país de origen (pasá el mouse para ver cuál).
- En el **timeline**, eventos como *"drop escaneo PSTN"* o *"fuerza bruta de registro"* con
  la IP y el número que intentaba marcar.
- El atacante suele **falsificar el From** (decir que es una extensión tuya) mientras
  intenta marcar a un número caro. Eso **no** significa que entró: el From es solo texto,
  y el destino real (no tu extensión) es lo que el SBC frena.

Qué podés hacer:

- **Bloquear** una IP a mano desde la lista, si querés adelantarte al automatismo. También podés
  **bloquear el país entero** desde la misma fila, si el ataque viene todo del mismo lado.
- **Desbloquear** una IP si fue un falso positivo (un cliente legítimo que disparó el
  anti-flood).
- Ajustar los umbrales si ves demasiados falsos positivos o demasiado ruido.

### 6.1 Cerrar el país: lista negra o lista blanca

» Seguridad » Filtro por país

Cuando el ruido viene concentrado geográficamente, esta es la medida más efectiva. Hay dos formas
y la elección importa:

- **Lista negra** — bloqueás los países que te molestan. Es lo indicado para cortar un foco
  puntual sin tocar nada más.
- **Lista blanca** — sólo entran los países que listás y **todo el resto se rechaza**. Es mucho
  más fuerte, y es lo correcto cuando tu telefonía es de uno o dos países y el resto sobra.

> **La lista blanca se puede volver en contra.** Si te olvidás de incluir tu propio país, te
> dejás afuera vos mismo: tus troncales y tus teléfonos remotos dejan de entrar. Agregá primero
> el país de tus centrales y operadores, aplicá, verificá que todo sigue andando, y recién
> después endurecé.
>
> Las IPs que el geolocalizador no puede ubicar se **dejan pasar** a propósito, para no cortar a
> alguien por un dato faltante. El resto de las defensas sigue actuando sobre ellas.

> **Cómo saber si un ataque logró algo:** mirá el CDR. Si no hay una llamada *conectada*
> (con estado 200 y duración) hacia el destino del atacante, no pasó nada — el borde lo
> frenó. Ver un INVITE en la captura **no** es una brecha: el paquete llega al cable
> porque el 5060 está abierto para el tráfico legítimo, pero Kamailio lo mata en la puerta.

![SOC durante un ataque: bloqueos con banderas y timeline de eventos](img/ope-06-soc-ataque.png)

---

## 7. Reiniciar un motor

» Diagnóstico » Motor SIP

Si un motor quedó en mal estado, desde acá lo reiniciás sin entrar por SSH. Tené en cuenta
que **reiniciar Kamailio o rtpengine corta las llamadas en curso** — no es una operación
de hora pico. El panel te lo advierte antes de hacerlo.

Después de un reinicio, volvé al *Resumen* y confirmá que el motor volvió a verde y que la
topología muestra las centrales y troncales respondiendo OPTIONS de nuevo.

![Pantalla de Motor SIP con el estado y el botón de reinicio](img/ope-07-motor.png)

---

## 8. Alertas por correo: dejá que el borde te avise

No tenés que vivir mirando el panel. Con el SMTP configurado (ver *Configuración → Notificaciones
por email*), el borde te escribe cuando algo pasa, con una plantilla clara y el logo de la app:

| Evento | Cuándo llega |
|---|---|
| **Ataque en curso** | Un pico de tráfico malicioso disparó las mitigaciones. |
| **IP bloqueada** | El anti-flood baneó una dirección. |
| **Motor caído / recuperado** | Un contenedor se cayó, y otro cuando vuelve. |
| **Troncal caída / recuperada** | Un operador dejó de responder OPTIONS, y cuando vuelve. |
| **Sospecha de fraude** | Un intento de marcar a un destino caro desde afuera. |
| **Resumen diario** | Un digest del borde: llamadas, bloqueos, estado. |

Así, un motor que se cae a las 3 de la mañana te llega al mail en vez de esperar a que alguien
mire el panel.

---

## 9. Rutina recomendada

Un borde bien cuidado casi no da trabajo, pero conviene una rutina liviana:

- **Cada mañana (2 min):** abrí el *Resumen*. Motores en verde, disco con margen, troncales
  respondiendo, internos registrados como esperás. Si todo está verde, listo.
- **Semanal (10 min):** pasá por el *SOC* (mirá si hubo ataques y cómo se contuvieron), revisá el
  *CDR* por llamadas raras, y confirmá que el MOS de tus enlaces sigue sano en la *Topología*.
- **Ante un reclamo puntual:** andá derecho a la *Captura SIP*, buscá la llamada por número o
  Call-ID, y leé la escalera. Ahí está qué pasó, sin adivinar.
- **Después de cualquier cambio** (troncal nueva, ruteo, extensión): verificá en el *Resumen* y la
  *Topología* que el enlace afectado quedó en verde.

---

## 10. Cuándo escalar

La mayoría de los problemas se ven y se resuelven en estas pantallas. Escalá al integrador
si:

- Un motor no vuelve a verde después de reiniciarlo.
- La IP pública que muestra *Red* no es la correcta y no se corrige sola.
- El MOS de un enlace está crónicamente bajo pese a que la red parece sana.
- Ves llamadas *conectadas* hacia destinos que nadie reconoce (posible compromiso de una
  credencial de extensión — cambiala y revisá el CDR).

Para todo lo demás, el borde está hecho para que lo operes vos, desde el panel, sin tocar
una línea de configuración.
