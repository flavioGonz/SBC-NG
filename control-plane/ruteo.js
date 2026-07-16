'use strict';
/* ============================================================================
 *  SBC-NG · ruteo de salida  (troncales -> drouting -> operador)
 *
 *  Esto tapa un agujero grande y silencioso: el panel guardaba la troncal en
 *  sbc_trunks, pero el dialplan de Kamailio rutea la salida con do_routing(), que
 *  lee dr_gateways / dr_rules. Una troncal que no esta en dr_gateways no existe
 *  para las llamadas. El panel decia "troncal creada" y el borde contestaba
 *  "404 No route to PSTN". Un panel que miente es peor que no tener panel.
 *
 *  El modelo, en criollo:
 *
 *    sbc_trunks  → dr_gateways   (POR DONDE se sale: la IP del operador, el strip
 *                                 y el prefijo que ESA troncal exige)
 *    sbc_routes  → dr_rules      (QUE numeros salen por cual troncal, por prefijo
 *                                 y con prioridad: la de arriba manda, y si el
 *                                 operador falla, el failover baja a la siguiente)
 *
 *  La sincronizacion es DESTRUCTIVA y completa: borra y reescribe las dos tablas
 *  desde las nuestras. Es a proposito. Reconciliar fila por fila deja huerfanos, y
 *  un huerfano en dr_rules es una llamada que sale por donde no debe.
 * ==========================================================================*/
const db = require('./db');
const kam = require('./kamailio');

/* La direccion como la quiere drouting.
 *
 * OJO: SIN el "sip:". drouting arma el R-URI el mismo (sip: + usuario + @ + esto), asi
 * que si le dejamos el esquema termina construyendo "sip:sip:172.20.30.9:5060" y
 * Kamailio contesta 479 "no pudimos procesar la URI". El sintoma es cruel: do_routing()
 * dice que SI encontro ruta, y la llamada muere igual.
 */
function direccion(t) {
  const puerto = t.provider_port || 5060;
  const tr = (t.transport || 'udp').toLowerCase();
  const sufijo = tr === 'udp' ? '' : ';transport=' + tr;
  return t.provider_host + ':' + puerto + sufijo;
}

async function sincronizar(tenant = 1) {
  const troncales = await db.get(
    'SELECT * FROM sbc_trunks WHERE tenant_id=$1 AND enabled ORDER BY id', [tenant]);
  const rutas = await db.get(
    `SELECT r.*, t.name AS trunk_name FROM sbc_routes r
       LEFT JOIN sbc_trunks t ON t.id = r.trunk_id
      WHERE r.tenant_id=$1 AND r.enabled AND r.trunk_id IS NOT NULL
      ORDER BY r.priority, r.id`, [tenant]);

  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM dr_rules');
    await c.query('DELETE FROM dr_gateways');

    // El gwid ES el id de la troncal. Asi la gwlist de una regla es, literalmente, el
    // id de la troncal que el operador eligio en la pantalla: no hay tabla de traduccion
    // que se pueda desincronizar.
    for (const t of troncales) {
      await c.query(
        `INSERT INTO dr_gateways (gwid, type, address, strip, pri_prefix, description, attrs)
         VALUES ($1, 0, $2, $3, $4, $5, $6)`,
        // attrs lleva el tope de llamadas simultaneas (CAC). drouting lo expone en
        // $avp(dr_attrs) tras do_routing; 0 = sin limite.
        [t.id, direccion(t), t.outbound_strip || 0, t.outbound_prefix || null, t.name, String(t.max_calls || 0)]);
    }

    // drouting toma la prioridad al reves de lo que uno espera: numero MAS BAJO = antes.
    // En el panel la mostramos como "prioridad" a secas, que es como la piensa el tecnico.
    for (const r of rutas) {
      await c.query(
        `INSERT INTO dr_rules (ruleid, groupid, prefix, timerec, priority, routeid, gwlist, description)
         VALUES ($1, '0', $2, '', $3, '', $4, $5)`,
        [r.id, r.pattern === '*' ? '' : (r.pattern || ''), r.priority || 10,
         String(r.trunk_id), r.name || ('regla ' + r.id)]);
    }

    // Las troncales que se REGISTRAN contra el operador viven en uac_reg. Las de IP fija
    // no llevan fila: no hay nada que registrar.
    await c.query('DELETE FROM uac_reg');
    for (const t of troncales.filter((x) => x.mode === 'register' && x.username)) {
      await c.query(
        `INSERT INTO uac_reg (l_uuid, l_username, l_domain, r_username, r_domain, realm,
                              auth_username, auth_password, expires, flags, reg_delay)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,3600,0,0)`,
        ['trunk' + t.id, t.from_user || t.username, t.from_domain || t.provider_host,
         t.username, t.provider_host, t.realm || t.provider_host,
         t.username, t.password || '']);
    }

    // Set 2 del dispatcher = SOLO monitoreo por OPTIONS de las troncales. El ruteo de
    // salida NO usa el dispatcher (usa drouting): este set existe para que Kamailio le
    // mande OPTIONS a cada operador y mida latencia/estado. Asi la troncal se ve viva o
    // caida con SIP de verdad, no con un ping ICMP que solo dice si hay ruta.
    await c.query('DELETE FROM dispatcher WHERE setid = 2');
    for (const t of troncales) {
      const puerto = t.provider_port || 5060;
      await c.query(
        'INSERT INTO dispatcher (setid, destination, flags, priority, description) VALUES (2, $1, 8, $2, $3)',
        ['sip:' + t.provider_host + ':' + puerto, t.id, 'trunk:' + t.name]);
    }

    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }

  return { troncales: troncales.length, rutas: rutas.length };
}

/* Escribir en la base no alcanza: drouting tiene las reglas en memoria. Sin el reload,
 * el panel dice "aplicado" y el borde sigue ruteando con lo de antes — el clasico
 * "pero si yo lo cambie". */
async function aplicar(tenant = 1) {
  const r = await sincronizar(tenant);
  const fallos = [];
  try { await kam.rpc('drouting.reload'); } catch (e) { fallos.push('drouting: ' + e.message); }
  try { await kam.rpc('dispatcher.reload'); } catch (e) { fallos.push('dispatcher: ' + e.message); }
  try { await kam.rpc('uac.reg_reload'); } catch (e) { fallos.push('uac: ' + e.message); }
  return { ...r, ok: fallos.length === 0, fallos };
}

/* Que ve Kamailio AHORA (no lo que dice nuestra tabla). Para que la pantalla no
 * pueda mentir: si el reload no entro, esto lo delata. */
async function enVivo() {
  const salida = { gateways: [], reglas: [], registros: [] };
  try { salida.gateways = await db.get('SELECT gwid, address, strip, pri_prefix, description FROM dr_gateways ORDER BY gwid'); } catch (_) {}
  try { salida.reglas = await db.get('SELECT ruleid, prefix, priority, gwlist, description FROM dr_rules ORDER BY priority, ruleid'); } catch (_) {}
  try { salida.registros = await kam.rpc('uac.reg_dump'); } catch (_) {}
  return salida;
}

module.exports = { sincronizar, aplicar, enVivo, direccion };
