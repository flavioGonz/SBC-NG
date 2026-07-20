-- ============================================================================
--  Registrar del borde (#182): el SBC TERMINA los registros SIP en el borde y
--  autentica por digest contra estas credenciales locales, en vez de reenviar
--  el REGISTER a la central. La ubicación se guarda en `location` (usrloc, que
--  ya existe desde 0001). Acá va la tabla de credenciales (auth_db).
--
--  Esquema `subscriber` estándar de Kamailio 6.1 (auth_db). Guardamos ha1 =
--  MD5(username:realm:password) y ha1b = MD5(username@domain:realm:password);
--  auth_db usa la columna ha1 (calculate_ha1=0), así la clave en claro no queda
--  en la base salvo que el operador la deje (password es opcional / informativa).
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscriber (
  id             SERIAL PRIMARY KEY,
  username       VARCHAR(64)  NOT NULL DEFAULT '',
  domain         VARCHAR(64)  NOT NULL DEFAULT '',
  password       VARCHAR(64)  NOT NULL DEFAULT '',
  email_address  VARCHAR(64)  NOT NULL DEFAULT '',
  ha1            VARCHAR(128) NOT NULL DEFAULT '',
  ha1b           VARCHAR(128) NOT NULL DEFAULT '',
  rpid           VARCHAR(64)  DEFAULT NULL,
  CONSTRAINT subscriber_account_idx UNIQUE (username, domain)
);
CREATE INDEX IF NOT EXISTS subscriber_username_idx ON subscriber (username);

-- Kamailio verifica la versión de cada tabla contra `version` (auth_db exige
-- subscriber=7). `location` ya está en version desde 0001. Registramos subscriber
-- (sin depender de un constraint único en version: borrar + insertar).
DELETE FROM version WHERE table_name = 'subscriber';
INSERT INTO version (table_name, table_version) VALUES ('subscriber', 7);

-- Metadatos nuestros por cuenta (quién la creó, nota, habilitada). No lo lee
-- Kamailio: es para el panel. Se enlaza por (username, domain).
CREATE TABLE IF NOT EXISTS sbc_edge_accounts (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(64) NOT NULL,
  domain      VARCHAR(64) NOT NULL DEFAULT '',
  descripcion TEXT,
  habilitado  BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (username, domain)
);
