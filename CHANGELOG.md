# Changelog · SBC-NG

## [0.1.0] — 2026-07-14

Primera versión como producto independiente. SBC-NG se separa de PBX-NG.

### Agregado
- **Base de datos propia** (`sbcng`): el SBC ya no comparte ni una tabla con la central.
- **Control-plane propio** con la API norte: attach, status, metrics, trunks, security, registrations.
- **Multi-tenant** desde el esquema (`tenant_id` en todas las tablas).
- **CAC**: límite de llamadas por troncal y por tenant.
- Campos de troncal que antes estaban escondidos: transporte (UDP/TCP/TLS), DTMF (RFC 4733 / inband /
  INFO), timers de sesión (RFC 4028), códecs, from-user y from-domain.
- Instalador propio: SBC-NG se instala sin ninguna central.
- Documentación: API norte, arquitectura, firewall.

### Cambiado
- Los comandos ya **no viajan por una tabla** (`pbxng_sbc_cmd`): el control-plane le habla a
  Kamailio por RPC y a rtpengine por el protocolo ng.

### Pendiente para 0.2
- Panel propio (hoy se administra por API).
- Transcoding activable por troncal desde el panel.
- Módulo de test de troncal con captura y diagnóstico.
- HEP/Homer.
