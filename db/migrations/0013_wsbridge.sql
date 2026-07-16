-- Troncales WebRTC en modo CLIENTE: el SBC se conecta hacia afuera por WSS a un
-- extremo remoto (otra PBX, un gateway) y hace de puente SIP-over-WSS <-> Kamailio.
-- Es lo que en PBX-NG era la troncal 'ies_link'. El modo SERVIDOR (que el remoto se
-- registre CONTRA el SBC) ya lo cubre el modulo websocket de Kamailio + el /ws del proxy.
ALTER TABLE sbc_trunks ADD COLUMN IF NOT EXISTS remote_url text DEFAULT '';

-- Estado en vivo del puente por troncal (lo escribe el contenedor wsbridge).
CREATE TABLE IF NOT EXISTS sbc_wsbridge_status (
  name       text PRIMARY KEY,
  state      text,
  detail     text,
  updated_at timestamptz DEFAULT now()
);

-- Interruptor del modulo (por si se quiere apagar el puente sin borrar troncales).
INSERT INTO sbc_settings (key, value) VALUES ('mod_wsbridge', '1') ON CONFLICT (key) DO NOTHING;
