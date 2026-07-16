-- ============================================================================
--  SBC-NG · 0006 · modulos del motor SIP y ajustes finos del TURN
--
--  Lo que antes solo se podia cambiar editando el kamailio.cfg y reconstruyendo la
--  imagen, ahora se edita desde el panel. Con red de contencion: la config se valida
--  en un contenedor efimero ANTES de tocar el que atiende llamadas, y si el motor no
--  levanta, se vuelve sola a la version anterior.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sbc_kam_modules (
  id         TEXT PRIMARY KEY,          -- topoh, siptrace, uac, ...
  habilitado BOOLEAN DEFAULT false,
  params     JSONB DEFAULT '{}',        -- los modparam que el panel deja tocar
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Los ajustes finos de coturn que no entran en la pantalla basica.
ALTER TABLE sbc_turn ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}';
