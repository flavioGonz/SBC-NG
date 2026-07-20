-- Geo-bloqueo por país (geoip2). Lista de country-codes ISO-3166-1 alpha-2 que el
-- borde rechaza en el ingreso. La bandera se muestra en el SOC (la IP bloqueada cae
-- en ipban y el panel ya resuelve su país por cc).
CREATE TABLE IF NOT EXISTS sbc_geoblock (
  cc         char(2) PRIMARY KEY,
  nombre     text,
  added_at   timestamptz NOT NULL DEFAULT now()
);
