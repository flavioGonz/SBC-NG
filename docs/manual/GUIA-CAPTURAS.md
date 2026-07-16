# Guía de capturas — Manuales SBC-NG

23 capturas en total. Guardá cada PNG con el **nombre exacto** en `docs/manual/img/`, después corré
`python3 scripts/build-manuals.py` y aparecen solas en su lugar (no hay que recompilar el panel; los
manuales leen las imágenes al abrirse).

Base del panel: `https://sbc.infratec.com.uy` · Tips: navegador a ~1440px de ancho, tema claro para
impresión, capturá el área de contenido (sin la barra del navegador). Nombre = el del recuadro.

---

## A) Desde el panel del SBC (17 capturas, una pasada)

### Monitor › Resumen  →  `/`
- **ins-03-resumen.png** — todos los motores en verde. Estado sano del stack.
- **ope-01-resumen.png** — igual pantalla, foco en motores + disco + memoria + interfaces. (Podés reusar la misma toma para ambas.)

### Monitor › Topología  →  `/topologia`
- **ins-01-topologia.png** — el mapa: internet/gateway a la izquierda, el SBC al centro, la central a la derecha. Vista general para explicar dónde vive el SBC.
- **ope-02-topologia.png** — acercá a un enlace para que se vean el temporizador de OPTIONS, la latencia y el MOS. Idealmente con la central y la troncal en verde.
- **cfg-03-troncal-webrtc.png** — si tenés una troncal WebRTC-cliente dada de alta, encuadrá el nodo WSS dibujado hacia su destino. (Si no hay ninguna, esta queda pendiente hasta configurar una.)

### Monitor › Transcoding  →  `/transcoding`
- **ope-03-transcoding.png** — mejor **con una llamada activa que transcodifique** (badge encendido, origen/destino y códecs a cada lado, animación del flujo). Si no hay llamada, capturá el estado en reposo.

### Monitor › CDR del borde  →  `/cdr`
- **ope-04-cdr.png** — la tabla con varias llamadas (origen, destino, duración, resultado). Mejor con datos.

### Señalización y Medios › Centrales (attach)  →  `/centrales`
- **cfg-01-central-alta.png** — abrí **Nueva central** y capturá el formulario (SIP URI, prioridad, contexto).

### Señalización y Medios › Troncales  →  `/troncales`
- **cfg-02-troncal-modo.png** — abrí **Nueva troncal** con el selector de modo visible (IP / registro / WebRTC-cliente).

### Señalización y Medios › Ruteo de salida  →  `/ruteo`
- **cfg-04-ruteo.png** — la tabla de rutas con al menos un par de patrones → troncal.

### Señalización y Medios › Extensiones SIP  →  `/registros`
- **cfg-05-extensiones.png** — la lista de extensiones remotas con su estado de registro (idealmente alguna en verde/registrada).

### Señalización y Medios › Manipulación SIP  →  `/reglas`
- **cfg-06-manipulacion.png** — el editor de reglas (con una o dos reglas de ejemplo para que se entienda).

### Señalización y Medios › Medios · TURN/STUN  →  `/medios`
- **cfg-07-medios.png** — el rango RTP y la configuración de TURN/STUN.

### Señalización y Medios › Motor SIP  →  `/motor`
- **ope-07-motor.png** — la lista de motores con estado + botón de reinicio.

### Diagnóstico › Captura SIP  →  `/captura`
- **ope-05-captura.png** — con un diálogo abierto en la escalera (ladder). Buscá una llamada reciente y desplegala.

### Diagnóstico › Intrusion Detection (SOC)  →  `/seguridad`
- **cfg-08-soc.png** — vista general del SOC: KPIs, banderas por país, bloqueos, timeline.
- **ope-06-soc-ataque.png** — durante (o después de) un ataque, con bloqueos y eventos en el timeline. El borde recibe escaneos solos; con esperar un rato suele haber material. (Podés reusar cfg-08 si no hay ataque en vivo.)

### Infraestructura › Red (LAN/WAN)  →  `/red`
- **cfg-09-red.png** — las interfaces con el RJ45 animado y la IP pública correcta.

### Infraestructura › Ajustes · Email  →  `/ajustes`
- **cfg-10-email.png** — el formulario de configuración SMTP.

### Pantalla de acceso (cerrá sesión)  →  `/login`
- **ins-04-login.png** — la pantalla de login con el logo animado.

---

## B) Fuera del panel del SBC (4 capturas)

Estas no salen del panel; hay que tomarlas de otras herramientas:

- **ins-02-installer.png** — una terminal corriendo `sudo ./install.sh`, mostrando las preguntas de IP pública y red confiable. (Terminal SSH al servidor.)
- **ins-05-npm-ws.png** — en tu **NGINX Proxy Manager**, el Proxy Host de `sbc.infratec.com.uy`, pestaña **Advanced**, con la `location /ws` a la vista.
- **ins-06-nat.png** — la tabla de **port-forwarding de tu router/firewall** apuntando al SBC (los puertos 5060, 8088, 3478, rangos RTP/TURN).
- **ins-01-topologia.png** — si preferís un diagrama de arquitectura “de manual” en vez del `/topologia` real, se puede dibujar aparte. Si no, usá la captura de `/topologia`.

---

## C) App de Escritorio (Windows) — 11 capturas

Estas se toman **desde la app PBX-NG Softphone en Windows** (no del panel del SBC). Nombres exactos:

- **sfd-01-instalador.png** — el instalador `.exe` corriendo, en español, en la pantalla de elegir carpeta.
- **sfd-02-splash.png** — la pantalla de bienvenida al abrir la app.
- **sfd-03-qr.png** — la pantalla de acceso con el botón de QR / "Pegar código".
- **sfd-04-webrtc.png** — la configuración en modo WebRTC (WSS, dominio, extensión).
- **sfd-05-sip.png** — la configuración en modo SIP nativo con las opciones avanzadas (SRTP, DTMF, TLS).
- **sfd-06-codec.png** — el selector de códec en Ajustes (Auto/Opus/G.722/G.711).
- **sfd-07-marcador.png** — el marcador con la búsqueda de contactos.
- **sfd-08-en-llamada.png** — una llamada en curso con los controles (mute, teclado, video, etc.).
- **sfd-09-mini.png** — la ventana flotante (modo mini) sobre otra aplicación.
- **sfd-10-bandeja.png** — el menú de la bandeja del sistema (Abrir / Iniciar con Windows / Salir).
- **sfd-11-diagnostico.png** — la sección de diagnóstico / dispositivos en Ajustes.

> El mismo set de imágenes sirve para el manual de escritorio de PBX-NG (mismas capturas, misma app).

---

## Resumen de reutilizables
Para acelerar: **ins-03 = ope-01** (Resumen), y **cfg-08 sirve de ope-06** si no hay ataque en vivo.
Con eso, las 23 se cubren con ~19 tomas reales.
