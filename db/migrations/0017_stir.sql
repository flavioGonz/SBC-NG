-- 0017 · STIR/SHAKEN (secsipid): verificar/firmar el header Identity (anti-spoofing del CallerID).
CREATE TABLE IF NOT EXISTS sbc_stir (
  id         smallint PRIMARY KEY DEFAULT 1,
  verify     boolean DEFAULT false,   -- verificar el Identity de lo que entra del operador
  sign       boolean DEFAULT false,   -- firmar el Identity de lo que originamos hacia el operador
  attest     text    DEFAULT 'A',     -- nivel de attestation al firmar: A / B / C
  x5u        text    DEFAULT '',       -- URL pública del certificado (va en el header, para firmar)
  key_pem    text    DEFAULT '',       -- clave privada EC (PEM) para firmar
  updated_at timestamptz DEFAULT now()
);
INSERT INTO sbc_stir(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
