-- El agujero que teniamos: la pantalla de troncales guardaba una fila en sbc_trunks,
-- pero el dialplan de Kamailio rutea la salida con do_routing() -> drouting, o sea
-- dr_gateways + dr_rules. Una troncal que no esta en dr_gateways NO EXISTE para las
-- llamadas. El panel decia que si; el borde decia que no.
--
-- Estas columnas son las que el operador siempre pide y que hoy no teniamos donde
-- guardar: cuantos digitos sacarle al numero y que prefijo ponerle al salir por ESTA
-- troncal (el "0" de la UCM, por ejemplo).
ALTER TABLE sbc_trunks ADD COLUMN IF NOT EXISTS outbound_strip  int  DEFAULT 0;
ALTER TABLE sbc_trunks ADD COLUMN IF NOT EXISTS outbound_prefix text DEFAULT '';

-- uac_reg: donde el modulo uac guarda las troncales contra las que el SBC se REGISTRA.
-- Estaba configurado en kamailio.cfg (reg_db_url) pero la tabla no existia: cualquier
-- troncal en modo registro era decorativa.
CREATE TABLE IF NOT EXISTS uac_reg (
  id            SERIAL PRIMARY KEY,
  l_uuid        VARCHAR(64)  NOT NULL DEFAULT '',
  l_username    VARCHAR(64)  NOT NULL DEFAULT '',
  l_domain      VARCHAR(190) NOT NULL DEFAULT '',
  r_username    VARCHAR(64)  NOT NULL DEFAULT '',
  r_domain      VARCHAR(190) NOT NULL DEFAULT '',
  realm         VARCHAR(64)  NOT NULL DEFAULT '',
  auth_username VARCHAR(64)  NOT NULL DEFAULT '',
  auth_password VARCHAR(64)  NOT NULL DEFAULT '',
  auth_ha1      VARCHAR(128) NOT NULL DEFAULT '',
  auth_proxy    VARCHAR(255) NOT NULL DEFAULT '',
  expires       INTEGER      NOT NULL DEFAULT 3600,
  flags         INTEGER      NOT NULL DEFAULT 0,
  reg_delay     INTEGER      NOT NULL DEFAULT 0,
  socket        VARCHAR(128) NOT NULL DEFAULT '',
  CONSTRAINT uac_reg_l_uuid_key UNIQUE (l_uuid)
);
