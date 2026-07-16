-- 0018 · STIR/SHAKEN: guardar tambien el certificado (se publica en la URL x5u).
ALTER TABLE sbc_stir ADD COLUMN IF NOT EXISTS cert_pem text DEFAULT '';
