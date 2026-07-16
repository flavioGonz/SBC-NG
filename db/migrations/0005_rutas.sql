-- ============================================================================
--  SBC-NG · 0005 · rutas estaticas DE RED
--
--  OJO con el nombre: sbc_routes ya existe desde la 0001 y son las rutas de LLAMADAS
--  (patron -> troncal, el LCR). Esto es otra cosa: rutas de RED, capa 3. Mezclarlas en
--  una tabla porque 'las dos son rutas' habria sido un desastre.
--
--  El SBC sale a internet por su ruta por defecto, pero no todo lo que necesita
--  alcanzar esta en internet: un operador puede entregar el SIP por un enlace
--  dedicado, o una central puede estar detras de otro router de la LAN. Sin una
--  ruta estatica, esos paquetes salen por la WAN y nunca vuelven.
--
--  Cada fila es exactamente un `ip route`: destino, gateway, placa y metrica.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sbc_net_routes (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT DEFAULT 1,
  destino    TEXT NOT NULL,          -- red destino en CIDR: 10.20.0.0/16
  gateway    TEXT,                   -- por donde: 192.168.1.254 (vacio = conectada)
  iface      TEXT,                   -- placa de salida (opcional)
  metrica    INT DEFAULT 100,        -- menor gana si hay dos rutas al mismo destino
  notas      TEXT,                   -- para que es: "SIP de Antel por el enlace dedicado"
  habilitada BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (destino, gateway)
);
CREATE INDEX IF NOT EXISTS sbc_net_routes_metrica_idx ON sbc_net_routes (metrica);

-- ============================================================================
--  Extensiones SIP vistas por el borde
--
--  El SBC es un proxy de registro transparente: no guarda usuarios ni los
--  autentica — eso lo hace la central. Reenvia el REGISTER y listo. Por eso
--  `ul.dump` (usrloc) esta siempre vacio y la pantalla "Registros SIP" no
--  mostraba nada: no habia nada que mostrar, por diseno.
--
--  Pero el dato SI existe: pasa por el borde. Cuando la central contesta 200 a
--  un REGISTER, Kamailio anota aca quien se registro, desde donde y con que
--  telefono. Es exactamente lo que el soporte necesita para contestar la
--  pregunta de todos los dias: "el 1004 dice que no le entran las llamadas".
-- ============================================================================

CREATE TABLE IF NOT EXISTS sbc_endpoints (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT DEFAULT 1,
  aor        TEXT NOT NULL,          -- 1004@pbx.cliente.com
  usuario    TEXT,                   -- 1004
  contacto   TEXT,                   -- la URI del telefono
  ip_origen  TEXT,                   -- de donde vino de verdad (detras del NAT)
  puerto     INT,
  transporte TEXT,                   -- udp | tcp | tls | ws | wss
  agente     TEXT,                   -- User-Agent: que telefono es
  expires    INT,
  central    TEXT,                   -- a que central lo mandamos
  registrado_at TIMESTAMPTZ DEFAULT now(),
  last_seen  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (aor, contacto)
);
CREATE INDEX IF NOT EXISTS sbc_endpoints_last_seen_idx ON sbc_endpoints (last_seen DESC);
