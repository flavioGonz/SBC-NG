-- 0016 · notificaciones por correo: qué eventos avisan + a quién.
-- El SBC ya detecta ataques, motores caídos y troncales caídas; esto define cuáles
-- de esos disparan un email y a qué destinatarios.
ALTER TABLE sbc_email ADD COLUMN IF NOT EXISTS alert_to text DEFAULT '';

CREATE TABLE IF NOT EXISTS sbc_notif_eventos (
  evento     text PRIMARY KEY,
  habilitado boolean DEFAULT true
);

INSERT INTO sbc_notif_eventos(evento, habilitado) VALUES
  ('security.attack', true),
  ('security.ban',    false),
  ('service.down',    true),
  ('service.up',      true),
  ('trunk.down',      true),
  ('fraud.toll',      true),
  ('digest.daily',    false)
ON CONFLICT (evento) DO NOTHING;
