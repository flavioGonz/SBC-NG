-- El codigo de pais (cc) para la bandera: vivia solo en la cache en memoria y se perdia
-- al reiniciar. Lo persistimos para que la bandera sobreviva.
ALTER TABLE sbc_blocked ADD COLUMN IF NOT EXISTS cc text;
