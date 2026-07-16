# Manual de Instalación

SBC-NG es el **borde** de tu telefonía: el único punto por el que la señalización y el
audio entran y salen hacia internet. Se instala como un *appliance* — una máquina
dedicada (física o virtual) que no comparte función con ninguna central. Esta guía lo
lleva desde una máquina limpia hasta un borde operativo, protegido y monitoreado.

> Antes de empezar, tené a mano tres datos: la **IP LAN** que va a tener el SBC dentro de
> tu red, la **IP o dominio público** por el que lo van a ver desde internet, y las
> **credenciales** de tu proxy inverso si ya usás uno.

---

## 1. Qué necesitás

El SBC no es exigente, pero es un componente crítico: dale recursos propios y no lo mezcles
con la central.

- **Sistema operativo:** Debian 12 o Ubuntu 22.04 (64 bits), instalación mínima.
- **CPU / RAM:** 2 vCPU y 2 GB alcanzan para un borde de PYME; 4 vCPU / 4 GB si vas a
  transcodificar muchas llamadas en paralelo (G.729 ↔ Opus consume CPU).
- **Disco:** 20 GB. El grueso lo ocupan las capturas SIP y el CDR; ambos rotan solos.
- **Red:** una placa alcanza. Si tenés LAN y WAN separadas físicamente, el SBC las
  reconoce y las muestra en el panel (ver *Manual de Configuración → Red*).
- **Docker + Docker Compose:** el instalador los pone si no están.

### 1.1 Dimensionamiento según el tráfico

El consumo del borde lo marca la **cantidad de llamadas simultáneas** y, sobre todo, cuántas de
esas llamadas hay que **transcodificar** (convertir de un códec a otro). Transcodificar cuesta
CPU; enrutar sin transcodificar casi no cuesta nada.

| Escenario | Llamadas en paralelo | vCPU | RAM | Disco |
|---|---|---|---|---|
| PYME / oficina | hasta ~30 | 2 | 2 GB | 20 GB |
| Empresa mediana | ~30 a ~120 | 4 | 4 GB | 40 GB |
| Con transcoding intensivo (G.729 ↔ Opus) | según el mix | 4–8 | 4–8 GB | 40 GB |

> **Regla práctica:** si tus centrales y tus operadores hablan el **mismo códec** (por ejemplo
> todo G.711), el SBC casi no transcodifica y 2 vCPU sobran. El costo aparece cuando un lado
> habla Opus/G.729 y el otro G.711, y el borde tiene que convertir en el medio.

### 1.2 Físico o virtual

El SBC corre igual en hierro dedicado o en una VM. Lo importante no es dónde corre, sino que
**tenga su propia CPU y su propia placa de red**, y que no comparta función con la central:

- **Máquina virtual (KVM/Proxmox VE, VMware, Hyper-V):** lo más común. Dale vCPU dedicadas.
- **Contenedor LXC (Proxmox):** funciona, pero necesita el módulo de red y los permisos para que
  Docker corra adentro; si dudás, una VM es más simple.
- **Físico:** para tráfico alto o cuando el SBC es el único equipo en la DMZ.

En cualquier caso, el reloj tiene que estar sincronizado (NTP): el CDR, los certificados TLS y la
verificación STIR dependen de una hora correcta.

![Diagrama de dónde vive el SBC: internet, el SBC en el borde, y las centrales detrás](img/ins-01-topologia.png)

---

## 2. Dónde se para el SBC en la red

El SBC se para **entre internet y tus centrales**. Nunca al revés. Las centrales
(PBX-NG, un 3CX, un Asterisk, un Grandstream UCM) quedan en la LAN, sin exponer un solo
puerto a internet: el SBC habla por ellas hacia afuera y filtra todo lo que entra.

- Del lado de **internet**, el SBC publica el 5060 (SIP), el 8088 (WebSocket SIP para
  softphones WebRTC) y el rango de medios de rtpengine.
- Del lado de la **LAN**, el SBC alcanza a cada central por su IP interna.

Esto significa que **la central deja de tener IP pública**. Si hoy tu PBX está expuesta,
el objetivo de instalar el SBC es justamente que deje de estarlo.

---

## 3. Instalación

Copiá el paquete al servidor y corré el instalador. Es interactivo y no da nada por
supuesto.

```
git clone https://github.com/flavioGonz/SBC-NG.git
cd SBC-NG
sudo ./install.sh
```

El instalador te va a preguntar, en orden:

1. **IP pública o dominio.** Si tu IP es fija, ponés la IP. Si es dinámica con DDNS,
   ponés el nombre (por ejemplo `sbc.miempresa.com`) y el SBC lo resuelve solo, y vuelve
   a resolverlo si la IP cambia. Si no sabés cuál es, dejalo en blanco: el SBC la
   **autodescubre por STUN** (ver *Configuración → Red*).
2. **Red confiable.** El rango de tu LAN (por defecto el /24 de la propia IP). Todo lo que
   venga de ahí queda exento del anti-flood: son tus centrales y tus teléfonos, no
   atacantes.
3. **Proxy inverso.** Si ya tenés un NGINX Proxy Manager u otro proxy publicando tus
   servicios, el instalador **no** levanta uno nuevo: te da los datos para que agregues el
   host vos (ver sección 6). Si no tenés, puede levantar el suyo.

![El instalador corriendo, mostrando las preguntas de IP pública y red confiable](img/ins-02-installer.png)

Cuando termina, levanta el stack y valida que cada motor arrancó. Si algo falla, lo dice
en pantalla con el nombre del contenedor y el motivo.

### 3.1 Qué hace el instalador por dentro

No es magia y no deja nada sin explicar. En orden, el `install.sh`:

1. **Verifica el sistema:** que sea Debian/Ubuntu 64 bits y que haya salida a Internet.
2. **Instala Docker y Docker Compose** si no están, y habilita el servicio.
3. **Escribe la configuración inicial** con lo que respondiste (IP pública, red confiable, proxy).
   No la hardcodea en el código: queda en la base y se edita después desde el panel.
4. **Construye o carga las imágenes** de cada motor (kamailio, rtpengine, coturn, wsbridge,
   control-plane, dashboard, postgres).
5. **Levanta el stack** con Docker Compose y espera a que cada contenedor pase su chequeo de salud.
6. **Aplica las migraciones** de la base de datos (crea las tablas del borde).
7. **Muestra las credenciales iniciales** del panel y una nota de firewall según tu escenario.

> Es **idempotente**: si lo corrés de nuevo, no rompe nada — reconcilia el estado. Sirve para
> reintentar si una descarga falló a mitad de camino.

### 3.2 Nota sobre el firewall del propio servidor

Si el servidor tiene `ufw`/`firewalld` activo, el instalador te avisa qué puertos abrir (los de la
sección 7). No los abre a la fuerza para no pisar una política tuya: te deja la matriz y vos
decidís. Para verificar el TURN de punta a punta (no sólo que el puerto está abierto, sino que el
relay funciona), el repositorio trae `scripts/check-turn.py`, que hace un *Allocate* real.

---

## 4. Qué queda corriendo

El SBC es un puñado de contenedores, cada uno con un trabajo:

- **kamailio** — el proxy SIP. Es el corazón: registra, rutea, y aplica toda la defensa.
- **rtpengine** — el motor de medios. Ancla el RTP, hace NAT de audio y transcodifica.
- **coturn** — el servidor TURN/STUN para los softphones WebRTC detrás de NAT.
- **wsbridge** — el puente para troncales WebRTC-cliente (interconexión entre sedes).
- **control-plane** — la API que maneja todo desde el panel.
- **dashboard** — el panel web.
- **postgres** — la base de datos del borde.

No hace falta que los conozcas de memoria: el panel te muestra el estado de todos en
*Monitor → Resumen* y en *Diagnóstico → Motor SIP*.

![El panel Resumen mostrando todos los motores en verde](img/ins-03-resumen.png)

---

## 5. Primer acceso al panel

Abrí el navegador contra la IP del SBC (o el dominio, si ya configuraste el proxy). Vas a
ver la pantalla de acceso con el logo animado.

```
http://IP-DEL-SBC/         (acceso directo por LAN)
https://sbc.miempresa.com/ (a través del proxy, con TLS)
```

Las credenciales iniciales las define el instalador y las muestra al terminar. **Cambialas
en el primer ingreso** desde *Ajustes*.

![Pantalla de login del SBC-NG con el logo animado](img/ins-04-login.png)

---

## 6. Publicar el SBC detrás de un proxy inverso (NGINX Proxy Manager)

Si usás jc21 NGINX Proxy Manager (lo más común), el panel del SBC va como cualquier host,
**pero hay un detalle que no podés olvidar**: el WebSocket SIP.

Creá el *Proxy Host*:

- **Domain:** `sbc.miempresa.com`
- **Forward:** `http://IP-DEL-SBC:3001` (el panel)
- **Websockets Support:** activado.
- **SSL:** pedí el certificado Let's Encrypt y forzá HTTPS.

Y ahora el detalle: en la pestaña **Advanced**, agregá una *location* para el WebSocket
SIP, que va a otro puerto (el 8088 de Kamailio):

```
location /ws {
    proxy_pass http://IP-DEL-SBC:8088;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

Sin esa *location*, el panel funciona pero los softphones WebRTC no registran: el
handshake `wss://sbc.miempresa.com/ws` devuelve 404 en vez de **101 Switching Protocols**.

![La pestaña Advanced del NPM con la location /ws agregada](img/ins-05-npm-ws.png)

> **Cómo verificarlo:** desde una terminal, `curl --http1.1 -i -N -H "Upgrade: websocket"
> -H "Connection: Upgrade" -H "Sec-WebSocket-Key: x" -H "Sec-WebSocket-Version: 13"
> https://sbc.miempresa.com/ws` tiene que responder **101**. Con HTTP/2 da 404 — es
> normal, el Upgrade no aplica; probá siempre con `--http1.1`.

---

## 7. Puertos y NAT

Si el SBC está detrás de un router/firewall, redirigí estos puertos desde la IP pública
hacia la IP del SBC:

| Puerto        | Protocolo | Para qué                                  |
|---------------|-----------|-------------------------------------------|
| 5060          | UDP y TCP | Señalización SIP                          |
| 8088          | TCP       | WebSocket SIP (softphones WebRTC)         |
| 3478          | UDP y TCP | STUN/TURN (coturn)                        |
| 49152–65535   | UDP       | Medios RTP (rtpengine) — rango amplio     |
| 30000–40000   | UDP       | Relay TURN (coturn)                       |

El detalle completo, con el porqué de cada uno y las notas de *hairpin NAT*, está en
`docs/FIREWALL.md` del repositorio.

![Tabla de port-forwarding en el router apuntando al SBC](img/ins-06-nat.png)

---

## 8. Problemas de instalación frecuentes

| Síntoma | Causa probable | Cómo resolverlo |
|---|---|---|
| El panel no abre | El contenedor `dashboard` o `control-plane` no arrancó | Mirá el estado de los contenedores; el instalador nombra el que falló y el motivo. Reintentá `install.sh`. |
| La IP pública que muestra *Red* es una privada | El STUN no salió, o el proxy/NAT tapa la dirección real | Cargá la IP fija o el dominio a mano en *Red*; revisá que el 3478 UDP salga. |
| Los softphones WebRTC no registran | Falta la `location /ws` en el proxy | Agregala (sección 6) y verificá con el `curl --http1.1` que da **101**. |
| Llamada conecta pero no hay audio | Medios/NAT: RTP o TURN sin camino | Redirigí el rango RTP y el TURN (sección 7); probá `check-turn.py`. |
| Un motor queda reiniciándose | Config inválida o puerto ocupado en el host | El panel *Motor SIP* muestra el estado; revisá que no haya otro servicio en el 5060/8088. |

> Casi todo lo de arriba se ve y se corrige **desde el panel**, sin SSH. Si un motor no vuelve a
> verde ni reiniciándolo, ahí sí escalá al integrador.

---

## 9. Lista de verificación final

Antes de dar el borde por instalado, confirmá:

- [ ] El panel abre y pudiste cambiar la contraseña inicial.
- [ ] En *Monitor → Resumen* todos los motores están en verde.
- [ ] En *Red*, el SBC muestra su IP pública correcta (la real, no una privada).
- [ ] Si usás softphones WebRTC, el `curl` al `/ws` devuelve 101.
- [ ] Los puertos de la tabla están redirigidos.
- [ ] Ninguna central tiene ya un puerto SIP expuesto a internet.

Con eso, el borde está listo para empezar a configurar centrales y troncales — eso es el
**Manual de Configuración**.
