-- CDR propio del borde: el módulo acc de Kamailio escribe acá una fila por cada
-- transacción contabilizada (el INVITE contestado y el BYE). El panel las cruza por
-- Call-ID para armar el registro de llamada (origen, destino, inicio, duración, cómo
-- terminó). Es el CDR del SBC, independiente del de la central.
CREATE TABLE IF NOT EXISTS acc (
  id         BIGSERIAL PRIMARY KEY,
  method     VARCHAR(16)  NOT NULL DEFAULT '',
  from_tag   VARCHAR(128) NOT NULL DEFAULT '',
  to_tag     VARCHAR(128) NOT NULL DEFAULT '',
  callid     VARCHAR(255) NOT NULL DEFAULT '',
  sip_code   VARCHAR(3)   NOT NULL DEFAULT '',
  sip_reason VARCHAR(128) NOT NULL DEFAULT '',
  time       TIMESTAMP    NOT NULL,
  src        VARCHAR(128) NOT NULL DEFAULT '',
  dst        VARCHAR(128) NOT NULL DEFAULT '',
  srcip      VARCHAR(64)  NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS acc_callid_idx ON acc (callid);
CREATE INDEX IF NOT EXISTS acc_time_idx ON acc (time DESC);
