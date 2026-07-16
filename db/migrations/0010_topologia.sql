-- Posiciones de los nodos en la topologia: el tecnico acomoda el dibujo a su red y
-- el panel se lo respeta. Sin esto, cada recarga vuelve todo al layout automatico y
-- se pierde el trabajo de ordenar.
CREATE TABLE IF NOT EXISTS sbc_topo_pos (
  tenant_id int  NOT NULL DEFAULT 1,
  node_key  text NOT NULL,
  x         real NOT NULL,
  y         real NOT NULL,
  PRIMARY KEY (tenant_id, node_key)
);

-- El gateway de salida (lo que en modo switch suele ser "internet"): un nodo mas del
-- dibujo. Puede ser autodetectado (la ruta por defecto) o fijado a mano.
INSERT INTO sbc_settings (key, value) VALUES ('topo_gateway_modo', 'auto') ON CONFLICT (key) DO NOTHING;
