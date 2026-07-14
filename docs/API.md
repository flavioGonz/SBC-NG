# API norte de SBC-NG

Es el **contrato con la central**. PBX-NG la consume igual que la consumiría un 3CX o un FreePBX:
el SBC no sabe —ni le importa— qué central tiene detrás.

## Autenticación

```
Authorization: Bearer <token>
```

Dos tipos de credencial, la misma cabecera:

| Credencial | Para qué | De dónde sale |
|---|---|---|
| **Token de API** | Que una central hable con el SBC | Panel → Tokens, o `sbc_api_tokens` |
| **JWT** | El panel del SBC | `POST /api/v1/auth/login` |

Todo lo que no sea `/health` o el login exige credencial. *Deny by default.*

## Endpoints

### Estado

```http
GET /health
GET /api/v1/status      # Kamailio, rtpengine y las centrales enganchadas
GET /api/v1/metrics     # llamadas, cps, RTP, bloqueos
```

### Enganchar una central

```http
POST /api/v1/attach
{ "name": "PBX principal", "sip_uri": "sip:192.168.1.10:5060", "priority": 10 }
```

Hace tres cosas de una: la anota como central, la agrega al **dispatcher** (para mandarle las
entrantes) y la mete en la tabla **address** (para aceptar sus salientes). Devuelve el `secret`.

```http
GET /api/v1/pbx         # las centrales enganchadas
```

### Troncales con el operador

```http
GET  /api/v1/trunks
POST /api/v1/trunks
{
  "name": "antel",
  "provider_host": "sip.operador.com",
  "transport": "udp",              // udp | tcp | tls
  "mode": "register",              // register | ip
  "username": "...", "password": "...",
  "codecs": "ulaw,alaw,g729",
  "dtmf": "rfc4733",               // rfc4733 | inband | info
  "session_timers": true,          // RFC 4028: varios operadores lo exigen
  "max_calls": 10                  // CAC
}
```

La contraseña **nunca vuelve** en un GET: sólo `tiene_password: true`.

### Seguridad

```http
GET  /api/v1/security/blocked     # IPs bloqueadas, con país e ISP
POST /api/v1/security/unblock     { "ip": "1.2.3.4" }
```

### Registros SIP en vivo

```http
GET /api/v1/registrations         # quién está registrado a través del SBC
```

## Errores

| Código | Qué significa |
|---|---|
| 400 | Falta un campo o está mal formado |
| 401 | Token ausente o inválido |
| 403 | El token no tiene permiso sobre ese tenant |
| 409 | Conflicto (ej: una troncal con ese nombre ya existe) |
| 500 | El SBC no pudo hablar con Kamailio o rtpengine |
