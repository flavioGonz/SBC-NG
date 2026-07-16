-- 0015 · gateway por troncal
-- Al diagnosticar una troncal detectamos, con `ip route get`, por qué gateway sale
-- el SBC hacia ese operador. Lo guardamos para dibujarlo en la topología: así el
-- mapa muestra el camino real (troncal → gateway → SBC), no uno inventado.
ALTER TABLE sbc_trunks ADD COLUMN IF NOT EXISTS gateway_ip  TEXT;
ALTER TABLE sbc_trunks ADD COLUMN IF NOT EXISTS gateway_dev TEXT;
