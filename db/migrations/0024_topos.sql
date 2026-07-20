-- ============================================================================
--  topos (#181): ocultamiento de topología POR ESTADO.
--
--  Diferencia con topoh: topoh CIFRA las cabeceras (Via/Record-Route/Contact) y
--  las manda enmascaradas; topos las GUARDA acá y las QUITA del mensaje, y las
--  repone cuando la respuesta/pedido vuelve por el diálogo. El otro lado no ve
--  absolutamente nada de la red interna — ni siquiera un blob cifrado.
--
--  Esquema oficial de Kamailio 6.1 (topos-create.sql de la propia imagen), con
--  las filas de `version` que el módulo exige (topos_d=2, topos_t=2).
--  Los dos son EXCLUYENTES: se usa topoh o topos, nunca los dos a la vez.
-- ============================================================================
CREATE TABLE IF NOT EXISTS topos_d (
    id SERIAL PRIMARY KEY NOT NULL,
    rectime TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    x_context VARCHAR(64) DEFAULT '' NOT NULL,
    s_method VARCHAR(64) DEFAULT '' NOT NULL,
    s_cseq VARCHAR(64) DEFAULT '' NOT NULL,
    a_callid VARCHAR(255) DEFAULT '' NOT NULL,
    a_uuid VARCHAR(255) DEFAULT '' NOT NULL,
    b_uuid VARCHAR(255) DEFAULT '' NOT NULL,
    a_contact VARCHAR(512) DEFAULT '' NOT NULL,
    b_contact VARCHAR(512) DEFAULT '' NOT NULL,
    as_contact VARCHAR(512) DEFAULT '' NOT NULL,
    bs_contact VARCHAR(512) DEFAULT '' NOT NULL,
    a_tag VARCHAR(255) DEFAULT '' NOT NULL,
    b_tag VARCHAR(255) DEFAULT '' NOT NULL,
    a_rr TEXT,
    b_rr TEXT,
    s_rr TEXT,
    iflags INTEGER DEFAULT 0 NOT NULL,
    a_uri VARCHAR(255) DEFAULT '' NOT NULL,
    b_uri VARCHAR(255) DEFAULT '' NOT NULL,
    r_uri VARCHAR(255) DEFAULT '' NOT NULL,
    a_srcaddr VARCHAR(128) DEFAULT '' NOT NULL,
    b_srcaddr VARCHAR(128) DEFAULT '' NOT NULL,
    a_socket VARCHAR(128) DEFAULT '' NOT NULL,
    b_socket VARCHAR(128) DEFAULT '' NOT NULL
);
CREATE INDEX IF NOT EXISTS topos_d_rectime_idx  ON topos_d (rectime);
CREATE INDEX IF NOT EXISTS topos_d_a_callid_idx ON topos_d (a_callid);
CREATE INDEX IF NOT EXISTS topos_d_a_uuid_idx   ON topos_d (a_uuid);
CREATE INDEX IF NOT EXISTS topos_d_b_uuid_idx   ON topos_d (b_uuid);

CREATE TABLE IF NOT EXISTS topos_t (
    id SERIAL PRIMARY KEY NOT NULL,
    rectime TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    x_context VARCHAR(64) DEFAULT '' NOT NULL,
    s_method VARCHAR(64) DEFAULT '' NOT NULL,
    s_cseq VARCHAR(64) DEFAULT '' NOT NULL,
    a_callid VARCHAR(255) DEFAULT '' NOT NULL,
    a_uuid VARCHAR(255) DEFAULT '' NOT NULL,
    b_uuid VARCHAR(255) DEFAULT '' NOT NULL,
    direction INTEGER DEFAULT 0 NOT NULL,
    x_via TEXT,
    x_vbranch VARCHAR(255) DEFAULT '' NOT NULL,
    x_rr TEXT,
    y_rr TEXT,
    s_rr TEXT,
    x_uri VARCHAR(255) DEFAULT '' NOT NULL,
    a_contact VARCHAR(512) DEFAULT '' NOT NULL,
    b_contact VARCHAR(512) DEFAULT '' NOT NULL,
    as_contact VARCHAR(512) DEFAULT '' NOT NULL,
    bs_contact VARCHAR(512) DEFAULT '' NOT NULL,
    x_tag VARCHAR(255) DEFAULT '' NOT NULL,
    a_tag VARCHAR(255) DEFAULT '' NOT NULL,
    b_tag VARCHAR(255) DEFAULT '' NOT NULL,
    a_srcaddr VARCHAR(255) DEFAULT '' NOT NULL,
    b_srcaddr VARCHAR(255) DEFAULT '' NOT NULL,
    a_socket VARCHAR(128) DEFAULT '' NOT NULL,
    b_socket VARCHAR(128) DEFAULT '' NOT NULL
);
CREATE INDEX IF NOT EXISTS topos_t_rectime_idx   ON topos_t (rectime);
CREATE INDEX IF NOT EXISTS topos_t_a_callid_idx  ON topos_t (a_callid);
CREATE INDEX IF NOT EXISTS topos_t_x_vbranch_idx ON topos_t (x_vbranch);
CREATE INDEX IF NOT EXISTS topos_t_a_uuid_idx    ON topos_t (a_uuid);

-- Kamailio valida la versión de cada tabla contra `version` (sin unique: borrar+insertar).
DELETE FROM version WHERE table_name IN ('topos_d', 'topos_t');
INSERT INTO version (table_name, table_version) VALUES ('topos_d', 2), ('topos_t', 2);
