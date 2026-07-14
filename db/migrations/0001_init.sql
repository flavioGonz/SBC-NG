-- ============================================================================
--  SBC-NG · esquema inicial
--
--  Esta base es SOLO del SBC. Antes estas tablas vivían mezcladas con las de la
--  central (PBX-NG) y por eso el SBC no se podía instalar solo. Acá no hay ni
--  una tabla de la central: si mañana el SBC se pone delante de un 3CX, esto
--  sigue funcionando igual.
--
--  Las tablas sin prefijo (dispatcher, secfilter, address, location, subscriber)
--  son las que Kamailio lee por sí mismo: los nombres los define Kamailio, no
--  nosotros. Todo lo nuestro va con prefijo sbc_.
-- ============================================================================

-- ── Kamailio: destinos a los que se reparten las llamadas (las centrales) ────
CREATE TABLE IF NOT EXISTS dispatcher (
  id          SERIAL PRIMARY KEY,
  setid       INT NOT NULL DEFAULT 1,
  destination VARCHAR(192) NOT NULL DEFAULT '',
  flags       INT NOT NULL DEFAULT 0,
  priority    INT NOT NULL DEFAULT 0,
  attrs       VARCHAR(128) NOT NULL DEFAULT '',
  description VARCHAR(64) NOT NULL DEFAULT ''
);

-- ── Kamailio: confianza por IP (las centrales y los operadores) ──────────────
CREATE TABLE IF NOT EXISTS address (
  id       SERIAL PRIMARY KEY,
  grp      INT NOT NULL DEFAULT 1,
  ip_addr  VARCHAR(50) NOT NULL,
  mask     INT NOT NULL DEFAULT 32,
  port     SMALLINT NOT NULL DEFAULT 0,
  tag      VARCHAR(64)
);

-- ── Kamailio: filtro de escáneres (User-Agent, IP, patrones) ─────────────────
CREATE TABLE IF NOT EXISTS secfilter (
  id     SERIAL PRIMARY KEY,
  action SMALLINT NOT NULL DEFAULT 0,   -- 0 = bloquear, 1 = permitir
  type   SMALLINT NOT NULL DEFAULT 0,   -- 0 = user-agent, 1 = país, 2 = ip, 3 = destino
  data   VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE (action, type, data)
);

-- ── Kamailio: registros SIP en vivo ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS location (
  id             SERIAL PRIMARY KEY,
  ruid           VARCHAR(64) NOT NULL DEFAULT '',
  username       VARCHAR(64) NOT NULL DEFAULT '',
  domain         VARCHAR(64),
  contact        VARCHAR(512) NOT NULL DEFAULT '',
  received       VARCHAR(128),
  path           VARCHAR(512),
  expires        TIMESTAMPTZ NOT NULL DEFAULT now(),
  q              REAL NOT NULL DEFAULT 1.0,
  callid         VARCHAR(255) NOT NULL DEFAULT '',
  cseq           INT NOT NULL DEFAULT 1,
  last_modified  TIMESTAMPTZ NOT NULL DEFAULT now(),
  flags          INT NOT NULL DEFAULT 0,
  cflags         INT NOT NULL DEFAULT 0,
  user_agent     VARCHAR(255) NOT NULL DEFAULT '',
  socket         VARCHAR(64),
  methods        INT,
  instance       VARCHAR(255),
  reg_id         INT NOT NULL DEFAULT 0,
  server_id      INT NOT NULL DEFAULT 0,
  connection_id  INT NOT NULL DEFAULT 0,
  keepalive      INT NOT NULL DEFAULT 0,
  partition      INT NOT NULL DEFAULT 0
);

-- ============================================================================
--  De acá para abajo, lo nuestro
-- ============================================================================

-- Configuración del SBC (dominio, IP pública, TLS, límites globales)
CREATE TABLE IF NOT EXISTS sbc_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Multi-tenant: cada cliente del SBC, con su realm y sus reglas.
-- En una instalación de un solo cliente hay un tenant y listo, pero la columna
-- ya está en todas las tablas: agregarla después obliga a migrar todo.
CREATE TABLE IF NOT EXISTS sbc_tenants (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  realm       TEXT UNIQUE,
  enabled     BOOLEAN DEFAULT true,
  max_calls   INT DEFAULT 0,          -- 0 = sin límite (CAC)
  created_at  TIMESTAMPTZ DEFAULT now()
);
INSERT INTO sbc_tenants (id, name, realm) VALUES (1, 'Principal', 'default')
  ON CONFLICT DO NOTHING;

-- Las centrales que hay detrás del SBC (lo que crea POST /api/v1/attach)
CREATE TABLE IF NOT EXISTS sbc_pbx (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL DEFAULT 1 REFERENCES sbc_tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sip_uri     TEXT NOT NULL,           -- sip:192.168.1.10:5060
  priority    INT DEFAULT 10,
  secret      TEXT,                    -- para la API norte, no para SIP
  context     TEXT DEFAULT 'from-trunk',
  enabled     BOOLEAN DEFAULT true,
  last_seen   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Troncales con el operador
CREATE TABLE IF NOT EXISTS sbc_trunks (
  id             SERIAL PRIMARY KEY,
  tenant_id      INT NOT NULL DEFAULT 1 REFERENCES sbc_tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  provider_host  TEXT NOT NULL,
  provider_port  INT DEFAULT 5060,
  transport      TEXT DEFAULT 'udp',   -- udp | tcp | tls
  mode           TEXT DEFAULT 'register', -- register | ip
  username       TEXT,
  password       TEXT,
  realm          TEXT,
  from_user      TEXT,
  from_domain    TEXT,
  codecs         TEXT DEFAULT 'ulaw,alaw,g729,opus',
  dtmf           TEXT DEFAULT 'rfc4733',  -- rfc4733 | inband | info
  session_timers BOOLEAN DEFAULT false,   -- RFC 4028: varios operadores lo exigen
  max_calls      INT DEFAULT 0,           -- CAC por troncal
  dids           TEXT[] DEFAULT '{}',
  enabled        BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- Ruteo saliente (LCR): qué patrón sale por qué troncal
CREATE TABLE IF NOT EXISTS sbc_routes (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL DEFAULT 1 REFERENCES sbc_tenants(id) ON DELETE CASCADE,
  name        TEXT,
  pattern     TEXT NOT NULL,        -- prefijo o regex
  trunk_id    INT REFERENCES sbc_trunks(id) ON DELETE SET NULL,
  strip       INT DEFAULT 0,
  prepend     TEXT,
  priority    INT DEFAULT 10,
  enabled     BOOLEAN DEFAULT true
);

-- Manipulación de cabeceras SIP (lo que cada operador pide distinto)
CREATE TABLE IF NOT EXISTS sbc_header_rules (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL DEFAULT 1 REFERENCES sbc_tenants(id) ON DELETE CASCADE,
  trunk_id    INT REFERENCES sbc_trunks(id) ON DELETE CASCADE,
  direction   TEXT DEFAULT 'out',   -- in | out
  header      TEXT NOT NULL,
  action      TEXT NOT NULL,        -- set | remove | replace
  value       TEXT,
  enabled     BOOLEAN DEFAULT true
);

-- IPs bloqueadas (lo que hoy vive en htable, persistido acá)
CREATE TABLE IF NOT EXISTS sbc_blocked (
  ip         TEXT PRIMARY KEY,
  reason     TEXT,
  country    TEXT,
  isp        TEXT,
  hits       INT DEFAULT 1,
  permanent  BOOLEAN DEFAULT false,
  blocked_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Bitácora de eventos del borde (ataques, bloqueos, troncal caída, attach)
CREATE TABLE IF NOT EXISTS sbc_events (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT DEFAULT 1,
  kind       TEXT NOT NULL,       -- attack | block | trunk_down | trunk_up | attach | cac
  severity   TEXT DEFAULT 'info', -- info | warn | crit
  detail     JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sbc_events_created_idx ON sbc_events (created_at DESC);

-- Usuarios del panel del SBC (no tienen nada que ver con los de la central)
CREATE TABLE IF NOT EXISTS sbc_users (
  id         SERIAL PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,       -- bcrypt
  role       TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tokens de la API norte (los que usa la central para hablarle al SBC)
CREATE TABLE IF NOT EXISTS sbc_api_tokens (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  token      TEXT UNIQUE NOT NULL,
  tenant_id  INT DEFAULT 1,
  last_used  TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
