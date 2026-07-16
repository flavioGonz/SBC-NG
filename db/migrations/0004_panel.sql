-- ============================================================================
--  SBC-NG · 0004 · red, medios y reglas SIP
--
--  Todo lo que hasta ahora vivía en variables de entorno (y por lo tanto sólo se
--  podía cambiar editando un .env y recreando contenedores) pasa a la base y se
--  edita desde el panel. El control-plane escribe los fragmentos de config en un
--  volumen compartido y reinicia el motor que corresponda.
-- ============================================================================

-- ── Modo de red ─────────────────────────────────────────────────────────────
--
--  ROUTER: el SBC es la frontera. Una pata mira a internet (WAN) y otra a la red
--  de la central (LAN); enruta y hace NAT entre las dos. NO reparte direcciones:
--  no hay servidor DHCP y no lo va a haber — un SBC no es un router de oficina,
--  y un DHCP mal puesto en la red de un cliente rompe más de lo que arregla.
--
--  SWITCH (bridge): el SBC no enruta nada; sus patas quedan en el mismo dominio
--  de capa 2, como un switch. Se usa cuando ya hay un router/firewall adelante y
--  el SBC sólo tiene que ver pasar el SIP.
CREATE TABLE IF NOT EXISTS sbc_net (
  id          INT PRIMARY KEY DEFAULT 1,
  modo        TEXT NOT NULL DEFAULT 'router',   -- router | switch
  wan_if      TEXT,                             -- router: la pata de internet
  lan_if      TEXT,                             -- router: la pata de la central
  nat         BOOLEAN DEFAULT true,             -- router: masquerade de LAN → WAN
  forward     BOOLEAN DEFAULT true,             -- router: ip_forward
  bridge      TEXT DEFAULT 'br0',               -- switch: nombre del puente
  aplicado_at TIMESTAMPTZ,
  aplicado_por TEXT,
  CONSTRAINT sbc_net_una_sola CHECK (id = 1)
);
INSERT INTO sbc_net (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Cada placa, con su rol y su modo. Lo que el panel dibuja con su RJ45.
CREATE TABLE IF NOT EXISTS sbc_iface (
  name        TEXT PRIMARY KEY,
  rol         TEXT DEFAULT 'sin_uso',   -- wan | lan | mgmt | sin_uso
  modo        TEXT DEFAULT 'dhcp',      -- dhcp | estatica | bridge (miembro del puente)
  ip          TEXT,                     -- modo estatica: 192.168.1.10/24
  gateway     TEXT,
  vlan        INT,                      -- switch: VLAN de acceso (opcional)
  notas       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Motor de medios (rtpengine) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sbc_media (
  id             INT PRIMARY KEY DEFAULT 1,
  port_min       INT DEFAULT 30000,
  port_max       INT DEFAULT 40000,
  timeout        INT DEFAULT 60,        -- sin RTP en N s → corta la llamada
  silent_timeout INT DEFAULT 3600,      -- sólo silencio → corta
  loglevel       INT DEFAULT 6,
  transcoding    BOOLEAN DEFAULT true,  -- global; después se decide por troncal
  dtls           BOOLEAN DEFAULT true,  -- SRTP/DTLS para WebRTC (RFC 5764)
  aplicado_at    TIMESTAMPTZ,
  CONSTRAINT sbc_media_una_sola CHECK (id = 1)
);
INSERT INTO sbc_media (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── TURN / STUN (coturn) ────────────────────────────────────────────────────
--
--  El TURN es lo que hace que un softphone detrás de un NAT simétrico tenga audio.
--  coturn lee external-ip UNA vez al arrancar y sólo acepta una IP literal: si la
--  pública es dinámica, hay que resolverla y reiniciarlo. Por eso está acá y no
--  en un .env que nadie vuelve a mirar.
CREATE TABLE IF NOT EXISTS sbc_turn (
  id          INT PRIMARY KEY DEFAULT 1,
  habilitado  BOOLEAN DEFAULT false,
  realm       TEXT,
  usuario     TEXT DEFAULT 'sbcng',
  secreto     TEXT,                     -- credencial estática (nunca se devuelve por la API)
  external_ip TEXT,                     -- IP pública o dominio DDNS
  port_min    INT DEFAULT 49152,
  port_max    INT DEFAULT 65535,
  tls         BOOLEAN DEFAULT false,
  stun_solo   BOOLEAN DEFAULT false,    -- true = STUN sí, relay TURN no
  aplicado_at TIMESTAMPTZ,
  CONSTRAINT sbc_turn_una_sola CHECK (id = 1)
);
INSERT INTO sbc_turn (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── Reglas SIP (manipulación de cabeceras) ──────────────────────────────────
--
--  Cada operador tiene su manía: uno quiere el número en el P-Asserted-Identity,
--  otro rechaza si ve un Diversion, otro exige un From con SU dominio. Esto es lo
--  que evita tener que tocar el kamailio.cfg a mano en cada alta de troncal.
CREATE TABLE IF NOT EXISTS sbc_sip_rules (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT DEFAULT 1,
  sentido     TEXT NOT NULL DEFAULT 'saliente',  -- saliente (hacia el operador) | entrante
  destino     TEXT DEFAULT 'todos',              -- 'todos' o el host de una troncal
  accion      TEXT NOT NULL,                     -- quitar_header | agregar_header | modificar_header
                                                 -- | set_from_user | set_pai | set_ppi | set_diversion
  header      TEXT,
  patron      TEXT,                              -- modificar_header: regex a buscar
  valor       TEXT,                              -- valor o pseudo-variable de Kamailio ($fU, $rU…)
  orden       INT DEFAULT 100,
  habilitada  BOOLEAN DEFAULT true,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sbc_sip_rules_orden_idx ON sbc_sip_rules (sentido, orden);

-- ── Seguridad ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sbc_sec (
  id              INT PRIMARY KEY DEFAULT 1,
  pike_req        INT DEFAULT 30,      -- pedidos permitidos…
  pike_seg        INT DEFAULT 10,      -- …en esta ventana de segundos
  ban_seg         INT DEFAULT 3600,    -- cuánto dura el bloqueo
  auth_fallidos   INT DEFAULT 5,       -- intentos de registro fallidos antes de banear
  secfilter       BOOLEAN DEFAULT true,-- filtrar User-Agents de escáneres conocidos
  geo_bloqueo     TEXT[] DEFAULT '{}', -- países bloqueados (ISO-2)
  solo_tls        BOOLEAN DEFAULT false,
  aplicado_at     TIMESTAMPTZ,
  CONSTRAINT sbc_sec_una_sola CHECK (id = 1)
);
INSERT INTO sbc_sec (id) VALUES (1) ON CONFLICT DO NOTHING;
