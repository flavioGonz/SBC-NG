-- ============================================================================
--  SBC-NG · tabla `trusted` (módulo permissions)
--
--  El módulo permissions es el que decide qué IP puede mandarnos llamadas
--  salientes (es lo que reemplazó al "src_ip == la IP de la única central").
--  Usa DOS tablas:
--
--    · address → la que llena el attach (allow_source_address)
--    · trusted → reglas más finas (por protocolo, por patrón de From o R-URI)
--
--  Aunque no usemos `trusted`, el módulo la abre igual al arrancar y verifica su
--  versión. Si no está, Kamailio NO LEVANTA — y el error habla de "invalid
--  version 0 for table trusted", que no le dice nada a nadie.
-- ============================================================================

CREATE TABLE IF NOT EXISTS trusted (
  id           SERIAL PRIMARY KEY,
  src_ip       VARCHAR(50) NOT NULL,
  proto        VARCHAR(4) NOT NULL,
  from_pattern VARCHAR(64) DEFAULT NULL,
  ruri_pattern VARCHAR(64) DEFAULT NULL,
  tag          VARCHAR(64),
  priority     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS trusted_src_ip_idx ON trusted (src_ip);

INSERT INTO version (table_name, table_version) VALUES ('trusted', 6)
ON CONFLICT (table_name) DO UPDATE SET table_version = EXCLUDED.table_version;
