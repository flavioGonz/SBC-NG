-- SBC-NG · /red: commit-confirm con auto-rollback + deshabilitar interfaces
--
-- applied_snapshot: la última config de red APLICADA Y CONFIRMADA (jsonb con modo,
--   placas y rutas). Es a lo que se vuelve si un cambio de modo corta la gestión y
--   nadie confirma a tiempo. Se setea recién cuando el operador confirma que sigue
--   conectado, así el "estado bueno conocido" nunca es uno que dejó al SBC aislado.
ALTER TABLE sbc_net  ADD COLUMN IF NOT EXISTS applied_snapshot jsonb;

-- deshabilitada: una placa que el operador bajó a propósito (ip link set down). El
--   panel la dibuja atenuada y el plan de red la baja explícitamente.
ALTER TABLE sbc_iface ADD COLUMN IF NOT EXISTS deshabilitada boolean NOT NULL DEFAULT false;
