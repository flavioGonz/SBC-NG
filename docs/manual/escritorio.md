# Manual de la App de Escritorio (Windows)

> **Para quién es este manual**
> Para el usuario que registra un teléfono **a través del borde SBC-NG** desde una PC con
> Windows, y para el administrador que instala y mantiene la app en la empresa. El softphone de
> escritorio es la forma recomendada de dar un **interno remoto** (alguien que trabaja fuera de
> la red) sin exponer la central: el teléfono habla sólo con el SBC, y el SBC hace de
> intermediario hacia la PBX.

La app se llama **PBX-NG Softphone** (la misma base de código para navegador, celular y Windows).
Contra el SBC-NG se usa de dos maneras, según cómo hayas dado de alta la extensión remota en el
borde (ver *Manual de Configuración → Extensiones SIP*):

- **WebRTC (WSS)** — el teléfono se conecta al **`/ws`** que el SBC publica en el proxy. Cifrado,
  atraviesa NAT, ideal para teletrabajo. Es el modo marca de la casa.
- **SIP nativo (UDP/TCP/TLS)** — el teléfono habla SIP directo contra la IP pública del SBC. Útil
  cuando no querés WebSocket o cuando el equipo lo prefiere.

En ambos casos el teléfono **nunca ve la central**: registra contra el borde, y el borde valida,
filtra y reenvía. Esa es toda la idea del SBC.

---

## 1. Cuándo conviene la app de escritorio

| | Navegador | Celular (PWA) | **App de escritorio (Windows)** |
|---|---|---|---|
| Instalar algo | No | Se agrega a la pantalla de inicio | Sí, un `.exe` |
| Suena si está minimizada / en segundo plano | Limitado | Limitado (iOS) | **Sí, siempre** |
| Atajos de teclado globales | No | No | **Sí (atender/colgar/silenciar)** |
| Ventana flotante siempre visible | No | No | **Sí (modo mini)** |
| Arranca solo con la PC | No | No | **Sí (iniciar con Windows)** |
| Click-to-call desde el CRM / navegador | No | No | **Sí (`tel:` / `sip:` / `callto:`)** |
| Se actualiza sola | Recargando la web | Sola | **Sí (auto-update)** |

Para un interno remoto fijo (alguien que trabaja siempre desde su casa), la app de escritorio es
la mejor opción: queda registrada contra el borde todo el día, suena aunque esté minimizada, y se
re-registra sola cuando vuelve la red.

---

## 2. Requisitos

- **Windows 10 o Windows 11**, 64 bits.
- **Micrófono** (auricular USB o el del notebook). Para video, una cámara.
- **Salida a Internet** hacia el borde SBC. La app tolera NAT gracias a STUN/TURN (ver §4.5); el
  SBC publica su servidor TURN (coturn) justamente para esto.
- **Permisos**: el `.exe` se instala por usuario y **no pide administrador**. El `.msi` corporativo
  sí requiere admin.

---

## 3. Instalación

### 3.1 Instalador individual (`.exe`)

El camino normal. El administrador te pasa `PBX-NG-Softphone-Setup-x.y.z.exe`.

1. Doble clic en el `.exe`.
2. El instalador está **en español**; te deja **elegir carpeta** o dejar la que propone.
3. Crea acceso directo en **escritorio** y **menú Inicio**.
4. Al terminar, arranca sola. **No pide administrador** (se instala en tu perfil).

![Instalador del softphone en español](img/sfd-01-instalador.png)

### 3.2 Despliegue en la empresa (`.msi`)

Para instalar en muchas PCs, el administrador usa el **`.msi`** (`PBX-NG-Softphone-x.y.z.msi`):
instala **per-machine** y se despliega en silencio por **GPO**, **Intune** o **SCCM**.

```
msiexec /i "PBX-NG-Softphone-x.y.z.msi" /qn
```

### 3.3 Versión portable

La carpeta **`win-unpacked`** trae `PBX-NG Softphone.exe`: corre sin instalar (pendrive, carpeta).
No trae auto-update ni accesos directos, pero es idéntica por dentro.

### 3.4 Primer arranque

Vas a ver una **pantalla de bienvenida** y después el acceso. Aceptá el **permiso de micrófono**
(y de cámara, para video) que pida Windows.

---

## 4. Configurar tu cuenta

### 4.1 Con el QR o el enlace (lo normal)

Si tu extensión remota se dio de alta con aprovisionamiento, el administrador te manda un **QR /
enlace** y la app se configura sola:

1. Abrí la app y tocá el **botón de QR**, arriba a la derecha del título.
2. En una PC (sin cámara) elegí **"Pegar código"** y pegá el enlace del correo.
3. La app detecta sola si tu extensión es **WebRTC** o **SIP**, se configura y queda en línea.

![Pegar el código de aprovisionamiento](img/sfd-03-qr.png)

### 4.2 A mano: modo WebRTC (contra el `/ws` del SBC)

El teléfono se conecta al WebSocket seguro que el **SBC publica en el proxy** (ver *Instalación →
Publicar el SBC detrás de un proxy inverso*, la `location /ws`).

| Campo | Qué poner | Ejemplo |
|---|---|---|
| **Servidor WebSocket (WSS)** | El `/ws` público del borde | `wss://sbc.tu-empresa.com/ws` |
| **Dominio SIP** | El dominio del borde, sin `wss://` | `sbc.tu-empresa.com` |
| **Extensión / usuario** | El número que te asignó el SBC | `9001` |
| **Contraseña** | La clave de tu extensión remota | — |
| **Nombre para mostrar** *(opcional)* | Cómo te ven | `Juan (remoto)` |

![Configuración en modo WebRTC](img/sfd-04-webrtc.png)

### 4.3 A mano: modo SIP nativo (contra la IP pública del SBC)

La app trae un **motor SIP propio** (UDP/TCP/TLS) que registra directo contra el borde.

| Campo | Qué poner | Ejemplo |
|---|---|---|
| **Servidor SIP** | Host o IP pública del SBC | `sbc.tu-empresa.com` |
| **Puerto** | 5060 (UDP/TCP) o 5061 (TLS) | `5060` |
| **Transporte** | UDP, TCP o TLS | `UDP` |
| **Dominio SIP** | El dominio del borde | `sbc.tu-empresa.com` |
| **Extensión y contraseña** | Los tuyos | `9001` |

Opciones avanzadas del modo SIP nativo:

| Opción | Para qué |
|---|---|
| **SRTP** | Cifra el audio (`none` / `sdes` / obligatorio) si el borde lo exige. |
| **DTMF** | Tonos del teclado: `RFC 4733` (recomendado) o `inband`. |
| **Verificar TLS** | Valida el certificado. Desactivalo sólo con certificados internos. |
| **Buscar por SRV (DNS)** | Resolución del servidor por registros SRV. |
| **MWI** | Aviso de mensajes en espera. |

![Configuración en modo SIP nativo](img/sfd-05-sip.png)

> **¿Cuál te toca?** Lo define **cómo se creó la extensión en el borde**. Si el administrador te
> mandó el enlace, la app resuelve el modo sola. Una extensión WebRTC no funciona en SIP nativo y
> viceversa.

### 4.4 Códecs de audio (para probar el transcoding del borde)

En **Ajustes** elegís el **códec** que prefiere la app:

- **Automático** (por defecto): los extremos negocian. Correcto casi siempre.
- **Opus / G.722 / G.711**: forzás una preferencia. Sirve para **ver el transcoding del SBC**: si
  la app pide Opus y el operador habla G.711, el borde transcodifica, y lo ves encendido en
  *Monitor → Transcoding*.
- **Forzar códec**: descarta los demás. Sólo para pruebas: si el otro extremo no lo soporta, no
  hay audio.

![Selector de códec en Ajustes](img/sfd-06-codec.png)

### 4.5 STUN y TURN

El audio viaja aparte de la señalización y detrás de NAT a veces no encuentra el camino (conecta
pero **no se escucha**). El **STUN** le dice a la app su IP pública; el **TURN** (el coturn del
propio SBC) hace de relay cuando el audio directo no es posible. El administrador te pasa el TURN
con su usuario y clave. Durante la llamada, una etiqueta indica **DIRECTO** o **VÍA TURN**.

### 4.6 Varias cuentas y almacenamiento cifrado

La app guarda **varias cuentas** y cambia entre ellas sin recargar los datos. En Windows, tu
configuración y tu contraseña se guardan **cifradas con DPAPI**: atadas a tu usuario de Windows,
ilegibles desde otra cuenta o copiando el archivo. (En el navegador no hay ese cifrado — otra
razón para la app de escritorio en un puesto fijo.)

---

## 5. El día a día

### 5.1 Llamar

Marcá en el teclado y tocá el verde, o **escribí el nombre** de un compañero. Tenés **favoritos**
e **historial** a mano.

![Marcador y búsqueda de contactos](img/sfd-07-marcador.png)

### 5.2 Recibir

La app **suena y salta al frente**, con **notificación de Windows** aunque esté en la bandeja.
Atendés con el verde, rechazás con el rojo.

### 5.3 Durante la llamada

| Botón | Qué hace |
|---|---|
| **Silenciar** | El otro deja de escucharte. |
| **Teclado** | Manda tonos DTMF. |
| **Retener** | Deja a la persona en espera. |
| **Transferir** | Pasás la llamada a otra extensión. |
| **Video** | Encendés la cámara. |
| **Invitar** | Sumás a otra persona. |
| **Grabar** | Graba la llamada. |
| **Volumen** | Ajustás cuánto escuchás. |

![Pantalla de llamada en curso](img/sfd-08-en-llamada.png)

### 5.4 Dispositivos

En **Ajustes → Dispositivos** elegís micrófono, altavoz y cámara. La app recuerda tu elección.

---

## 6. La ventana flotante (modo mini)

El botón **mini** encoge el teléfono a una ventanita **siempre visible** sobre las demás
aplicaciones: atendés, silenciás, cortás y subís/bajás el volumen desde ahí. Al entrar una
llamada, **vibra** para avisarte.

![La ventana flotante](img/sfd-09-mini.png)

---

## 7. Bandeja del sistema y arranque con Windows

Al cerrar con la **X**, la app **no se cierra**: se esconde en la **bandeja** y sigue registrada.
Clic derecho en el ícono:

- **Abrir** — trae la ventana.
- **Iniciar con Windows** — arranca sola al prender la PC, minimizada y ya registrada.
- **Salir** — cierra de verdad.

![Menú de la bandeja del sistema](img/sfd-10-bandeja.png)

---

## 8. Atajos de teclado globales

Funcionan desde cualquier aplicación, sin la ventana al frente:

| Atajo | Acción |
|---|---|
| **Ctrl + Shift + A** | Atender la entrante |
| **Ctrl + Shift + H** | Colgar / rechazar |
| **Ctrl + Shift + M** | Silenciar / reactivar |

---

## 9. Click-to-call

La app maneja los enlaces **`tel:`**, **`sip:`** y **`callto:`**: un clic en un número (en el CRM,
una planilla, una web) **abre el softphone y marca solo**. También:

```
start tel:099123456
```

---

## 10. Notificaciones y re-registro automático

- **Notificaciones de Windows** al entrar una llamada, aunque la app esté en la bandeja.
- **Re-registro automático** cuando la PC vuelve de suspensión, se desbloquea o vuelve la red. No
  hay que reconectar a mano.

---

## 11. Actualizaciones automáticas

La app **se actualiza sola**: al abrirla chequea si hay versión nueva, la baja en segundo plano y
te avisa para aplicarla al reiniciar. El administrador publica; a los usuarios les llega solo.

---

## 12. Problemas frecuentes

» Ajustes → Dispositivos  ·  Ajustes → Diagnóstico

| Qué te pasa | Qué hacer |
|---|---|
| Dice **"sin conectar"** | Fijate el Internet. La app muestra **el motivo real** abajo del estado (ej. *"Registro rechazado (401)"*). |
| **No te escuchan** | Micrófono en Ajustes → Dispositivos y permiso de Windows. |
| **No escuchás** | Altavoz en Ajustes → Dispositivos y volumen de la llamada. |
| **Conecta pero no hay audio** | Es NAT/medios: pasale al administrador la etiqueta *VÍA TURN / DIRECTO*. Puede faltar TURN en el borde. |
| **Registro rechazado (401/403)** | Extensión o clave mal, o la IP quedó bloqueada por el anti-flood del SBC. El administrador lo ve en *Diagnóstico → Intrusion Detection*. |
| **Con certificado interno no conecta (TLS)** | En SIP nativo, desactivá *Verificar TLS*. |
| **Se venció el acceso** | Pedile un enlace nuevo (vencen a las 24 h). |

![Sección de diagnóstico de la app](img/sfd-11-diagnostico.png)

> **Nota para el operador del borde:** si un interno remoto no registra, mirá *Intrusion
> Detection* — un anti-flood disparado por reintentos con clave mala puede haber bloqueado su IP.
> Desbloqueala desde la lista si es un falso positivo (ver *Manual de Operación → Responder a un
> ataque*).

---

## 13. Para el administrador: construir el instalador

El softphone es un proyecto único (PWA + web + Electron). Desde `softphone-app/`, en Windows (o
Linux + wine):

```
npm install
npm run dist          # genera .exe (NSIS) y .msi (WiX) en release/
npm run build && npm run electron   # prueba rápida sin empaquetar
```

`release/` queda con el **`.exe`** (individual, con auto-update), el **`.msi`** (corporativo,
per-machine) y **`win-unpacked/`** (portable).

Si `npm run dist` corta en **`winCodeSign`** (*"Cannot create symbolic link… privilegio
requerido"*): la app igual queda en `release/win-unpacked/`; para los instaladores, activá el
**Modo de desarrollador** de Windows o corré la terminal **como Administrador** y reintentá. En CI
(runner Windows) no ocurre. El **auto-update** sale por GitHub Releases; para producción conviene
**firmar** el `.exe`/`.msi` (ver `softphone-app/SIGNING.md`).

---

Con esto, la app de escritorio queda cubierta de punta a punta. El borde en sí —troncales, ruteo,
seguridad— es el **Manual de Configuración**; el día a día del operador, el **Manual de Operación**.
