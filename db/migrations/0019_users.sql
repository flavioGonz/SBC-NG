-- 0019 · Usuarios del panel con roles ricos.
--
-- Antes: sbc_users era sólo (username, password bcrypt, role default 'admin'). El primer
-- arranque creaba UN admin y no había forma de dar de alta a nadie más desde el panel.
-- Ahora: gestión de usuarios (alta/baja/edición) con tres roles —admin, operador, lector—
-- coherentes con las audiencias de los manuales, más nombre para mostrar, activo (para
-- suspender sin borrar) y last_login.
ALTER TABLE sbc_users ADD COLUMN IF NOT EXISTS nombre     TEXT;
ALTER TABLE sbc_users ADD COLUMN IF NOT EXISTS activo     BOOLEAN DEFAULT true;
ALTER TABLE sbc_users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Normalizar roles viejos: cualquier valor fuera de la terna queda como admin (el usuario
-- que creó el primer arranque). No dejamos roles fantasma.
UPDATE sbc_users SET role = 'admin' WHERE role IS NULL OR role NOT IN ('admin', 'operador', 'lector');
UPDATE sbc_users SET activo = true WHERE activo IS NULL;
