-- SBC-NG · dialplan (traducción de números por tabla) — PREPARACIÓN, módulo default-off
--
-- Tabla estándar del módulo dialplan de Kamailio (schema version 2). Se crea acá para
-- que, cuando el operador habilite el módulo en /motor, Kamailio la encuentre con la
-- versión correcta (si falta la fila en `version`, el módulo no carga y el motor no
-- arranca). Mientras el módulo esté apagado, esta tabla no la lee nadie: es inerte.
CREATE TABLE IF NOT EXISTS dialplan (
  id        SERIAL PRIMARY KEY,
  dpid      INTEGER NOT NULL,                         -- id del "plan": agrupa reglas que se evalúan juntas
  pr        INTEGER DEFAULT 0 NOT NULL,               -- prioridad dentro del plan (menor = antes)
  match_op  INTEGER NOT NULL,                         -- 0 = texto exacto · 1 = expresión regular
  match_exp VARCHAR(64) NOT NULL,                     -- lo que se busca
  match_len INTEGER DEFAULT 0 NOT NULL,               -- largo esperado (0 = no chequear)
  subst_exp VARCHAR(64) DEFAULT '' NOT NULL,          -- regex de sustitución
  repl_exp  VARCHAR(64) DEFAULT '' NOT NULL,          -- con qué se reemplaza
  attrs     VARCHAR(64) DEFAULT '' NOT NULL           -- atributos que quedan disponibles tras traducir
);

-- Kamailio chequea la versión de cada tabla al cargar el módulo. Sin esta fila, dialplan
-- se niega a arrancar. La insertamos sólo si no está (no pisar si ya existiera).
INSERT INTO version (table_name, table_version)
  SELECT 'dialplan', 2 WHERE NOT EXISTS (SELECT 1 FROM version WHERE table_name = 'dialplan');
