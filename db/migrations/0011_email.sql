-- Correo saliente del borde: una sola config (el SBC es un appliance, no multiempresa).
-- Sirve para las alertas del panel SOC y cualquier aviso que el SBC quiera mandar.
CREATE TABLE IF NOT EXISTS sbc_email (
  id         int PRIMARY KEY DEFAULT 1,
  host       text,
  port       int  DEFAULT 587,
  secure     boolean DEFAULT false,
  username   text,
  password   text DEFAULT '',
  from_addr  text,
  enabled    boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT sbc_email_single CHECK (id = 1)
);
INSERT INTO sbc_email (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
