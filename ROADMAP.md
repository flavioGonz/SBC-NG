# SBC-NG · Roadmap de producto

> Revisión hecha sobre el código real (23 pantallas del panel, control-plane, config de
> Kamailio 6.1 / rtpengine mr13.5 / coturn), no sobre intenciones.
>
> **SBC-NG es el borde**, un producto independiente: se pone delante de PBX-NG, de un 3CX, de
> un FreePBX o de varias centrales a la vez. Esa independencia es el argumento de venta —
> no es "el módulo de seguridad de nuestra central", es un SBC.

---

## 1. Dónde estamos

| Área | Estado |
|---|---|
| **Ruteo y troncales** | Troncales por IP, con registro y **WebRTC-cliente** (enlace entre sedes por WSS); LCR con failover y tope de saltos; CAC por troncal; manipulación de cabeceras SIP; números/DIDs por troncal con CallerID de salida y **ruteo de DID entrante** |
| **Medios** | rtpengine con anclaje, transcoding, y **interworking SRTP↔RTP** (SDES y DTLS/WebRTC → RTP plano hacia la central); TURN/STUN propio con sonda real de verificación |
| **Seguridad** | Anti-flood (pike+ipban), filtro de escáneres (secfilter), **filtro por país con lista negra o blanca** (geoip2), ocultamiento de topología **topoh o topos**, CAC anti-fraude, STIR/SHAKEN (listo, apagado por defecto), TLS nativo u operado por proxy, ACME/Let's Encrypt |
| **Registro** | Modo **proxy** (default) y **registrar del borde** con digest local (opcional) |
| **Operación** | SOC en vivo con socket.io (mapa de ataques, bloqueos con bandera y motivo, indicador "bajo ataque"), captura SIP con analizador, CDR propio del borde con país/ISP/bloqueo y códigos SIP explicados, topología, monitoreo de troncales por OPTIONS con latencia y MOS |
| **Plataforma** | Appliance Docker, panel con validación + **rollback automático** en cada cambio del motor, migraciones versionadas, manuales in-panel (instalación, configuración, operación, escritorio, RFCs) |

El patrón de **validar en un Kamailio efímero y revertir solo si el motor no levanta** es, a
esta altura, la mejor característica de ingeniería del producto. Hay que sostenerlo en todo lo
que se agregue.

---

## 2. Brechas reales

Verificado en el código y contra el lab (CT113) el **2026-07-20**.

| Brecha | Estado | Por qué importa |
|---|---|---|
| **Respaldo y restauración** | **No existe** | Un borde se respalda entero: base + fragmentos de `/etc/sbcng` + certificados + manifiesto de versión. Hoy recuperar depende de saber qué copiar |
| **RFC 5626 (SIP Outbound)** | Parcial: hay keepalive, **falta `reg-id` / `+sip.instance` y múltiples flujos** | La central ya lo cierra (Path, multi-flujo, keepalive). Que el borde quede atrás es una asimetría incómoda de explicar, y se nota con clientes móviles que pasan de wifi a datos |
| **Video sobre SRTP** | No soportado | El interworking de medios cubre audio. Ahora que el softphone nativo genera H.264, esto cierra el círculo |
| **userblacklist (#183)** | Pendiente: **el `.so` no está compilado** en la imagen | Único módulo del plan de Kamailio que falta. Requiere compilarlo de fuente para 6.1, así que toca el build. Está en `habilitado=false`, sin riesgo activo |
| **Observabilidad** | Parcial: Prometheus expuesto, sin panel ni alertas | Falta el tablero de referencia y alertas listas sobre lo que importa: troncal caída, ataque sostenido, CAC al tope |
| **Multi-inquilino** | Parcial (`tenant_id` en las tablas, sin aislamiento real) | Define si se puede poner un borde delante de varios clientes y facturarlo |
| **Alta disponibilidad** | No existe | Un SBC es un punto único de falla por definición. Para clientes medianos es requisito |

---

## 3. Roadmap propuesto

### 3.1 Ahora

1. **RFC 5626 real** en el registrar del borde: `reg-id`, `+sip.instance` y múltiples flujos por
   AoR. Cierra la asimetría con la central y es la diferencia entre "anda" y "anda cuando el
   celular pasa de wifi a datos". Va con el patrón de siempre: fragmento `.cfg` con `#!ifdef`,
   apagado por defecto, validar-y-revertir.
2. **Respaldo y restauración desde el panel**, con el **mismo formato de manifiesto que PBX-NG**
   para que los dos productos se respalden igual.
3. **Video sobre SRTP**: extender el interworking al video.

### 3.2 Próximo

4. **userblacklist (#183)**: compilar el módulo en la imagen y agregar sus tablas.
5. **Observabilidad**: panel de referencia y alertas listas para usar.
6. **Multi-inquilino completo**: aislamiento por cliente en pantallas y API.

### 3.3 Después

7. **Alta disponibilidad**: dos bordes con IP virtual y estado compartido. Es el salto de
   "appliance de PYME" a "infraestructura".
8. **Certificación de interoperabilidad** con los operadores de la región: una matriz probada de
   "con este operador, esta configuración funciona". Vale más que cualquier feature nueva a la
   hora de vender.

---

## 4. Criterio de "listo para vender sin asteriscos"

Instalarse en menos de una hora delante de una central existente, enganchar la troncal del
operador y las extensiones remotas, resistir el escaneo de internet sin intervención, mostrar
en pantalla qué frenó y por qué, y poder revertir cualquier cambio sin dejar el borde caído.

Eso ya se cumple. Lo que falta es lo de **continuidad** (respaldo y HA) y **escala comercial**
(multi-inquilino). El respaldo es el primero de los dos: es barato y hoy no existe.

---

## 5. Relación con PBX-NG

SBC-NG debe seguir siendo **independiente de la central**: cualquier feature que asuma PBX-NG
del otro lado es deuda. La regla práctica que ya seguimos: el borde funciona **con o sin** SBC
en la topología del cliente, y la central funciona con o sin borde. El roadmap de la central
está en `ROADMAP.md` de PBX-NG.
