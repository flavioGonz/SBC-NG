# Evaluación de motores — Kamailio y rtpengine (julio 2026)

## Dónde estamos vs. lo último

| Motor | SBC-NG hoy | Último estable | Antigüedad |
|-------|-----------|----------------|------------|
| **Kamailio** | 5.6.6 (repo `kamailio56`) | **6.1.3** (may-2026) · 6.0.7 · 5.8.8 | La rama 5.6 está **fuera de soporte**. Nos separan 3 ramas (5.8 → 6.0 → 6.1). |
| **rtpengine** | mr11.5.1.24 | **mr13.5 (LTS)** · mr14.1 | ~2 ramas mayores atrás. mr13.5 es **LTS** (parches por años). |

Ninguno de los dos recibe ya parches de seguridad en la versión que corremos. Eso solo, para un producto que se vende, es razón suficiente para subir.

---

## Kamailio 5.6 → 6.1: qué ganamos

Filtrado a lo que un SBC (y este SBC en particular) realmente aprovecha:

### 1. Rendimiento — UDP multi-hilo
6.0 trae `udp_receiver_mode`: un solo proceso multi-hilo recibiendo el 5060 en vez de N procesos. En un borde, donde **todo el SIP entra por UDP**, esto sube el techo de llamadas/segundo sin tocar el dialplan. Directo a la escalabilidad del appliance.

### 2. Protección de las centrales — Overload Control (RFC 7339)
El `dispatcher` (que ya usamos para monitorear centrales y troncales con OPTIONS) ahora hace **control de sobrecarga**: si una central empieza a ahogarse, el SBC le baja el caudal en vez de tumbarla. Hay `dispatcher.oclist` por RPC y más campos `$dsg(...)`. **Esto es una feature de SBC de gama** que hoy no tenemos y que podríamos exponer en el panel.

### 3. STIR/SHAKEN — `secsipid`
Verificación criptográfica del CallerID (identidad del que llama). Cada vez más operadores lo exigen y es un diferencial anti-fraude fuerte. Encaja natural en el panel de **Intrusion Detection / SOC**: "llamada con identidad no verificada".

### 4. Observabilidad — Prometheus nativo (`xhttp_prom`)
6.0 exporta métricas (uptime, memoria, contadores SIP, 4xx, etc.) en formato Prometheus. Podríamos:
- alimentar Grafana para el cliente que ya tiene stack de monitoreo, y
- reemplazar parte de nuestro polling casero del panel por métricas reales del motor.

### 5. rtpengine mejor monitoreado desde Kamailio
El módulo `rtpengine` ahora tiene **timer de ping a las instancias** y campo `active` en `rtpengine.show`. Hoy inferimos el estado del motor de medios; con esto lo sabríamos de primera mano y lo pintaríamos bien en la topología.

### 6. SDP más rico (`sdpops`, `$sdp(...)`)
Nuevas variables: `$sdp(m0:rtp:port)`, `$sdp(o:ip)`, familia de direcciones, códecs. Sirve para enriquecer la pantalla de **Transcoding en vivo** (puerto RTP real, IP de origen del medio) sin depender solo de la captura.

### 7. TLS moderno (OpenSSL 3)
Soporte de provider keys de OpenSSL 3. Debian 12 ya trae OpenSSL 3; alinea el stack TLS del borde con el sistema y evita el ENGINE deprecado.

### 8. CDR más útil (`acc` / kamcli)
Reportes nuevos: llamadas perdidas, top destinos, estadísticas por método SIP. Material directo para enriquecer nuestro panel de **CDR del borde**.

### ⚠️ Lo que ROMPE al subir (hay que tocar la cfg)
- **`dialog`: se eliminó `dlg_flag`.** Nosotros hoy hacemos `setflag(4); dlg_manage()`. En 6.x hay que migrar a `dlg_mode` / `dlg_manage()` con la API nueva (`dlg_set_state`, `dlg_update_state`). **Es el cambio obligatorio principal.**
- Módulos archivados (osp, print, app_lua_sr, etc.) — no usamos ninguno, sin impacto.
- Varios modparams cambiaron de nombre/tipo. Requiere una pasada de `kamailio -c` y revisión de deprecados.
- El salto 5.6 → 6.1 es grande; conviene validarlo entero en el lab (CT113) antes de tocar nada productivo.

---

## rtpengine mr11 → mr13.5 (LTS): qué ganamos

### 1. Transcoding más fino
- **flag `force`**: forzar transcodificación entre canales (útil cuando querés garantizar un códec de salida sí o sí).
- **opción `ignore`** de códec: como `strip`, pero solo afecta a los códecs del SDP entrante. Control más quirúrgico por troncal.

### 2. Nodos de transcoding dedicados — método NG `transform`
Permite **sacar el transcoding a nodos aparte**. Para escalar un cliente grande sin que el borde principal se coma la CPU de los códecs. Es la base de una arquitectura de medios distribuida.

### 3. Interfaces de medios por archivo
Config de interfaces RTP y **rangos de puertos distintos por interfaz** vía archivo. Encaja con nuestra separación LAN/WAN: rangos de medios distintos por placa, declarativo.

### 4. Music on Hold `reflect` + varios
Modo MoH que reusa las capacidades del otro extremo, más un montón de bugfixes de estabilidad de ICE/DTLS (WebRTC) que en mr11 arrastramos.

### 5. LTS = estabilidad para un appliance
mr13.5 es **Long Term Support**: recibe parches por años sin cambiar de comportamiento. Para algo que se instala en el cliente y no se toca seguido, es exactamente lo que querés (mejor que ir a mr14 recién salido).

---

## Recomendación

**Kamailio → 6.1.x** y **rtpengine → mr13.5 (LTS)**, validado primero en el lab CT113.

Por qué 6.1 y no quedarse en 5.8: las features que mueven la aguja para un SBC vendible (UDP multi-hilo, overload control, Prometheus, secsipid) están en la 6.x. 5.8.8 sería un salto menor y más seguro, pero deja esas features afuera. Si preferís mínimo riesgo primero, 5.8.8 es un escalón intermedio válido.

Por qué rtpengine LTS y no mr14: un appliance quiere estabilidad multi-año, no lo último.

### Plan por fases (todo en el lab primero)
1. **Rama de imágenes nueva** — Dockerfile de Kamailio apuntando a `kamailio61`; `RTPENGINE_VERSION=mr13.5.x`. Sin tocar producción.
2. **Migrar la cfg**: reemplazar `dlg_flag` por la API nueva de `dialog`; pasar `kamailio -c` y arreglar modparams deprecados. Es lo único que verdaderamente rompe.
3. **Levantar en CT113** y correr la batería de siempre: attach + OPTIONS, registro de troncal, una llamada con transcoding, WSS 101, defensa SOC. Comparar contra el comportamiento actual.
4. **Aprovechar lo nuevo, incremental** (una feature por release, no todo junto):
   - Prometheus `xhttp_prom` → nueva fuente de métricas para el Resumen.
   - `rtpengine.show active` + ping timer → estado real del motor en la topología.
   - Overload control del dispatcher → protección de centrales, expuesto en el panel.
   - secsipid (STIR/SHAKEN) → verificación de identidad en el SOC.
5. **Recién entonces**, promover la imagen a los despliegues productivos.

### Esfuerzo estimado
- Subir versiones + migrar la cfg (dialog) + verificar en lab: **1 día**, la mayor parte en la migración de `dialog` y el testeo.
- Cada feature nueva explotada (Prometheus, OC, secsipid, sdpops): **medio a un día cada una**, e independientes entre sí — se pueden cortar como releases separados.

### Riesgo
Bajo-medio, y **contenido**: nada toca producción hasta pasar la verificación en CT113. El único punto que sí o sí hay que resolver es la migración de `dialog` (dlg_flag → dlg_mode); el resto son mejoras aditivas.
