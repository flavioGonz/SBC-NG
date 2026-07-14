# Puertos y firewall · SBC-NG

El SBC **es** la superficie expuesta: es lo único que ve internet. Si un puerto de esta tabla está
cerrado, la falla no es obvia — la llamada entra y se corta, o atiende y no se escucha nada. Por eso
conviene abrirlos todos de una y verificar.

## Lo que hay que abrir

| Puerto | Protocolo | Para qué | ¿Obligatorio? |
|---|---|---|---|
| **5060** | UDP y TCP | SIP: troncales del operador y teléfonos remotos | Sí |
| **5061** | TCP | SIP sobre TLS (si lo usás) | Opcional |
| **8088** | TCP | WebSocket SIP (WebRTC). Normalmente lo publica el proxy con TLS en 443 | Sólo con WebRTC |
| **30000-40000** | UDP | **RTP**: el audio y el video de todas las llamadas | Sí |
| **3478** | UDP y TCP | STUN/TURN | Sólo con WebRTC |
| **49152-65535** | UDP | Relay del TURN | Sólo con WebRTC |
| **3100** | TCP | Panel y API norte del SBC | Sí (o detrás de un proxy) |

## El error que se paga caro: el rango RTP

**Si abrís el 5060 pero no el rango RTP, la llamada se establece y no se escucha nada.** El SIP
viaja, el teléfono suena, se atiende… y silencio. Es el síntoma más común y el más confuso, porque
la señalización funcionó perfecto.

## NAT y hairpin

Si el SBC está detrás de un router con NAT (lo normal):

1. **Redirigí** los puertos de arriba desde el router hacia la IP interna del SBC.
2. Configurá **`PUBLIC_IP`** con tu IP pública o tu nombre DDNS. Sin eso, el SBC anuncia su IP
   interna en el SDP y el audio va a una dirección que no existe en internet.
3. **Hairpin (NAT loopback)**: si además hay teléfonos *dentro* de la misma red que salen a la IP
   pública, el router tiene que saber devolverles el tráfico. Sin hairpin, el que está en la oficina
   no puede llamar y el que está afuera sí — un síntoma que vuelve loco a cualquiera.

## Verificar que quedó bien

```bash
# ¿El SIP responde desde afuera?
sipsak -vv -s sip:tu-sbc.com

# ¿El TURN entrega un candidato relay de verdad?
turnutils_uclient -y -u sbcng -w <clave> tu-sbc.com
```

Si el TURN devuelve **701** o no devuelve nada, casi siempre es NAT: falta el hairpin o la
`PUBLIC_IP` está mal.
