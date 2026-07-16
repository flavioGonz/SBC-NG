-- La IP publica deja de ser un dato que se pide a mano: se descubre.
-- Modo de resolucion del external-ip de coturn (y, por extension, del borde):
--   auto = preguntarle a un STUN (para IP dinamica de proveedor)
--   fqdn = resolver un nombre con DDNS
--   fija = una IP literal, para el que tiene IP fija
ALTER TABLE sbc_turn ADD COLUMN IF NOT EXISTS ip_modo  text DEFAULT 'auto';
ALTER TABLE sbc_turn ADD COLUMN IF NOT EXISTS ip_fqdn  text DEFAULT '';

-- Ajustes globales de IP publica (los consumen coturn, rtpengine y kamailio a la vez).
INSERT INTO sbc_settings (key, value) VALUES
  ('ip_modo', 'auto'),
  ('ip_auto_aplicar', '1')
ON CONFLICT (key) DO NOTHING;
