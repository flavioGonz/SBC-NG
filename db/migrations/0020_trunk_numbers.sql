-- 0020 · Números (DIDs) por troncal.
--
-- Un operador SIP suele asignarte VARIOS números (un rango de DIDs). Antes sólo teníamos
-- `sbc_trunks.dids TEXT[]` (una lista plana) y un único `from_user` como CallerID. Ahora
-- cada número es una fila con vida propia: podés elegir con cuál SALÍS (CallerID por
-- defecto), y a dónde ENTRA cada uno (ruteo del DID a un destino).
CREATE TABLE IF NOT EXISTS sbc_trunk_numbers (
  id             SERIAL PRIMARY KEY,
  tenant_id      INT NOT NULL DEFAULT 1 REFERENCES sbc_tenants(id) ON DELETE CASCADE,
  trunk_id       INT NOT NULL REFERENCES sbc_trunks(id) ON DELETE CASCADE,
  number         TEXT NOT NULL,               -- el número, en el formato que exige el operador (E.164 o nacional)
  label          TEXT,                         -- para qué es: "Recepción", "Ventas", "Fax"…
  es_cid_default BOOLEAN DEFAULT false,        -- se presenta como CallerID de salida cuando la ruta no fija otro
  inbound_dest   TEXT,                         -- destino cuando ENTRA una llamada a este DID (sip:uri, interno, o vacío = central por defecto)
  enabled        BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (trunk_id, number)
);
CREATE INDEX IF NOT EXISTS ix_trunk_numbers_trunk ON sbc_trunk_numbers (trunk_id);
-- Un solo default por troncal (índice parcial).
CREATE UNIQUE INDEX IF NOT EXISTS ux_trunk_numbers_cid ON sbc_trunk_numbers (trunk_id) WHERE es_cid_default;

-- CallerID por ruta: con qué número de la troncal salir para ESTA regla. NULL = el default de la troncal.
ALTER TABLE sbc_routes ADD COLUMN IF NOT EXISTS cid_number TEXT;

-- Sembrar el pool desde el array dids[] que ya existía en cada troncal (una sola vez).
INSERT INTO sbc_trunk_numbers (tenant_id, trunk_id, number)
SELECT t.tenant_id, t.id, d
  FROM sbc_trunks t, unnest(COALESCE(t.dids, '{}')) AS d
 WHERE d IS NOT NULL AND d <> ''
ON CONFLICT (trunk_id, number) DO NOTHING;
