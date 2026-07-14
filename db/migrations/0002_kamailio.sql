-- ============================================================================
--  SBC-NG · tablas que Kamailio exige (y la tabla `version`, que es la trampa)
--
--  Kamailio verifica la VERSIÓN de cada tabla que abre. Si no encuentra la fila
--  correspondiente en `version`, no arranca — y el mensaje de error no dice eso,
--  dice "invalid version". Es una tarde perdida si no se sabe. Por eso las filas
--  se siembran acá, junto con las tablas.
--
--  Los números de versión son los de Kamailio 5.6: no son inventados, están en
--  el esquema oficial de cada módulo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS version (
  table_name    VARCHAR(32) NOT NULL,
  table_version INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT version_t_name_idx UNIQUE (table_name)
);

-- ── LCR / drouting: por qué operador sale cada número, con failover ──────────
CREATE TABLE IF NOT EXISTS dr_gateways (
  gwid        SERIAL PRIMARY KEY,
  type        INTEGER NOT NULL DEFAULT 0,
  address     VARCHAR(128) NOT NULL,
  strip       INTEGER NOT NULL DEFAULT 0,
  pri_prefix  VARCHAR(64),
  attrs       VARCHAR(255),
  description VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS dr_rules (
  ruleid      SERIAL PRIMARY KEY,
  groupid     VARCHAR(255) NOT NULL,
  prefix      VARCHAR(64) NOT NULL,
  timerec     VARCHAR(255) NOT NULL DEFAULT '',
  priority    INTEGER NOT NULL DEFAULT 0,
  routeid     VARCHAR(64) NOT NULL DEFAULT '',
  gwlist      VARCHAR(255) NOT NULL,
  description VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS dr_gw_lists (
  id          SERIAL PRIMARY KEY,
  gwlist      VARCHAR(255) NOT NULL,
  description VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS dr_groups (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(64) NOT NULL,
  domain      VARCHAR(128) NOT NULL DEFAULT '',
  groupid     INTEGER NOT NULL DEFAULT 0,
  description VARCHAR(128) NOT NULL DEFAULT ''
);

-- ── uacreg: el SBC se registra contra los operadores que lo exigen ───────────
--  Cuidado con la estructura: Kamailio 5.6 espera la v5 (con socket y
--  contact_addr). Con la v4 el módulo uac falla la consulta y las troncales con
--  registro no levantan.
CREATE TABLE IF NOT EXISTS uacreg (
  id             SERIAL PRIMARY KEY,
  l_uuid         VARCHAR(64) NOT NULL DEFAULT '',
  l_username     VARCHAR(64) NOT NULL DEFAULT '',
  l_domain       VARCHAR(64) NOT NULL DEFAULT '',
  r_username     VARCHAR(64) NOT NULL DEFAULT '',
  r_domain       VARCHAR(64) NOT NULL DEFAULT '',
  realm          VARCHAR(64) NOT NULL DEFAULT '',
  auth_username  VARCHAR(64) NOT NULL DEFAULT '',
  auth_password  VARCHAR(64) NOT NULL DEFAULT '',
  auth_ha1       VARCHAR(128) NOT NULL DEFAULT '',
  auth_proxy     VARCHAR(255) NOT NULL DEFAULT '',
  expires        INTEGER NOT NULL DEFAULT 0,
  flags          INTEGER NOT NULL DEFAULT 0,
  reg_delay      INTEGER NOT NULL DEFAULT 0,
  socket         VARCHAR(128) NOT NULL DEFAULT '',
  contact_addr   VARCHAR(255) NOT NULL DEFAULT '',
  CONSTRAINT uacreg_l_uuid_idx UNIQUE (l_uuid)
);

-- ── las versiones que Kamailio va a buscar ──────────────────────────────────
INSERT INTO version (table_name, table_version) VALUES
  ('dispatcher', 4),
  ('address',    6),
  ('secfilter',  1),
  ('location',   9),
  ('dr_gateways', 6),
  ('dr_rules',    3),
  ('dr_gw_lists', 1),
  ('dr_groups',   2),
  ('uacreg',      5)
ON CONFLICT (table_name) DO UPDATE SET table_version = EXCLUDED.table_version;

-- ── escáneres conocidos: la lista negra de arranque ──────────────────────────
--  Son los User-Agent de las herramientas que golpean puertos SIP todo el día.
--  Bloquearlos de entrada saca la mitad del ruido antes de mirar nada.
INSERT INTO secfilter (action, type, data) VALUES
  (0, 0, 'friendly-scanner'),
  (0, 0, 'sipvicious'),
  (0, 0, 'sipcli'),
  (0, 0, 'sundayddr'),
  (0, 0, 'iWar'),
  (0, 0, 'sip-scan'),
  (0, 0, 'sipsak'),
  (0, 0, 'VaxSIPUserAgent'),
  (0, 0, 'siparmyknife'),
  (0, 0, 'smap'),
  (0, 0, 'Test Agent'),
  (0, 0, 'pplsip'),
  (0, 0, 'scanner')
ON CONFLICT (action, type, data) DO NOTHING;
