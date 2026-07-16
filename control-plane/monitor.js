'use strict';
/* ============================================================================
 *  SBC-NG · monitor de nodos de la topología (centrales, troncales, gateway).
 *
 *  El estado, la latencia y el MOS de cada nodo salen de OPTIONS SIP de verdad —
 *  no de un ping ICMP. Kamailio (dispatcher) le manda un OPTIONS cada 30 s a cada
 *  central (set 1) y a cada troncal (set 2, solo monitoreo) y mide el RTT. De ese
 *  RTT sacamos:
 *    · estado   → contesta el OPTIONS o no
 *    · latencia → el RTT del OPTIONS (ida y vuelta)
 *    · MOS      → calidad estimada (modelo E simplificado) a partir de la latencia
 *    · último OK → cuándo fue el último OPTIONS que contestó (para el timer del panel)
 *
 *  El gateway no habla SIP: ese sí se sondea con ICMP (solo interesa "hay ruta").
 * ==========================================================================*/
const db = require('./db');
const kam = require('./kamailio');
const diag = require('./diag');
const correo = require('./email');

// Estado anterior de cada nodo, para avisar SOLO en la transición (caída o
// recuperación), no en cada barrido. Arranca vacío: el primer barrido no dispara nada.
const previo = {};
function avisarTransicion(key, ok, nombre, tipo) {
  const antes = previo[key];
  previo[key] = ok;
  if (antes === undefined || antes === ok) return;   // sin cambio (o primer dato)
  if (!ok) correo.notificar(tipo === 'central' ? 'service.down' : 'trunk.down',
    { severity: tipo === 'central' ? 'crit' : 'warn',
      title: `${tipo === 'central' ? 'Central' : 'Troncal'} ${nombre} no responde`,
      lines: [['Nodo', nombre], ['Tipo', tipo === 'central' ? 'Central (attach)' : 'Troncal (operador)'], ['Cuándo', new Date().toLocaleString('es-UY')]],
      foot: 'El borde dejó de recibir respuesta al OPTIONS. Revisá el enlace en la topología.' }).catch(() => {});
  else correo.notificar('service.up',
    { severity: 'info', title: `${nombre} se recuperó`,
      lines: [['Nodo', nombre], ['Cuándo', new Date().toLocaleString('es-UY')]],
      foot: 'Volvió a responder OPTIONS.' }).catch(() => {});
}

const CADA = +(process.env.MONITOR_SEG || 20) * 1000;
let cache = { ts: 0, nodos: {} };
const ultimoOk = {};   // { nodeKey: epoch_ms del último OPTIONS que contestó }

const host = (s) => String(s || '').replace(/^sips?:/, '').split('@').pop().split(':')[0].split(';')[0].trim();

/* MOS estimado desde la latencia (modelo E simplificado, ITU-T G.107).
 * Asumimos pérdida ~0 (no la medimos todavía). Es una ESTIMACIÓN: sirve para ver de
 * un vistazo si un enlace está bien (4.0+), regular (3.6–4.0) o pobre (<3.6). */
function mosDeLatencia(rttMs) {
  if (rttMs == null) return null;
  const d = rttMs / 2;                                   // one-way
  const Id = 0.024 * d + 0.11 * Math.max(0, d - 177.3);
  const R = Math.max(0, Math.min(93.2, 93.2 - Id));
  let mos = 1 + 0.035 * R + 7e-6 * R * (R - 60) * (100 - R);
  mos = Math.max(1, Math.min(4.5, mos));
  return Math.round(mos * 100) / 100;
}

/* Aplana dispatcher.list a { host: {activo, latencia_ms} }. La latencia sólo aparece
 * si ds_ping_latency_stats está prendido (lo está); si no, queda null. */
function leerDispatcher(d) {
  const mapa = {};
  const sets = (d && d.RECORDS) || [];
  for (const rec of sets) {
    const set = rec.SET || rec;
    const targets = (set.TARGETS || []);
    for (const wrap of targets) {
      const t = wrap.DEST || wrap;
      const h = host(t.URI || '');
      if (!h) continue;
      const flags = String(t.FLAGS || '');
      // Activo salvo que esté marcado Inactive/Probing/Disabled sin la A.
      const activo = /A/.test(flags) && !/I/.test(flags);
      const lat = t.LATENCY || {};
      // EST es el estimador del RTT. En LAN suele ser <1 ms y viene 0: eso NO es "sin
      // medir", es "medido, casi cero". Solo es null si no hay objeto LATENCY (nunca
      // contestó un OPTIONS). Preferimos EST; si es 0 usamos AVG por si el estimador
      // todavía no arrancó.
      const tieneLat = t.LATENCY && (lat.EST != null || lat.AVG != null);
      const est = Number(lat.EST); const avg = Number(lat.AVG);
      const rtt = tieneLat ? (Number.isFinite(est) && est > 0 ? est : (Number.isFinite(avg) ? avg : est)) : null;
      mapa[h] = { activo, latencia_ms: (activo && rtt != null && Number.isFinite(rtt)) ? Math.round(rtt) : null };
    }
  }
  return mapa;
}

async function pingIcmp(ip) {
  if (!ip) return { ok: false, ms: null };
  try {
    const r = await diag.ping(ip);
    const m = String(r.salida).match(/=\s*[\d.]+\/([\d.]+)\//);
    return { ok: r.ok, ms: m ? Math.round(+m[1]) : null };
  } catch (_) { return { ok: false, ms: null }; }
}

function componer(key, ok, latencia, via) {
  if (ok) ultimoOk[key] = Date.now();
  return {
    ok,
    latencia_ms: latencia,
    mos: ok ? mosDeLatencia(latencia) : null,
    ultimo_ok: ultimoOk[key] || null,
    via,
  };
}

async function barrer() {
  const nodos = {};
  let disp = {};
  try { disp = leerDispatcher(await kam.rpc('dispatcher.list')); } catch (_) {}

  // centrales (set 1) — por OPTIONS
  const centrales = await db.get('SELECT id, name, sip_uri FROM sbc_pbx WHERE enabled');
  for (const c of centrales) {
    const d = disp[host(c.sip_uri)];
    if (d) nodos['pbx' + c.id] = componer('pbx' + c.id, d.activo, d.latencia_ms, 'OPTIONS');
    else { const p = await pingIcmp(host(c.sip_uri)); nodos['pbx' + c.id] = componer('pbx' + c.id, p.ok, p.ms, 'ping'); }
    avisarTransicion('pbx' + c.id, nodos['pbx' + c.id].ok, c.name || c.sip_uri, 'central');
  }

  // troncales (set 2) — por OPTIONS
  const troncales = await db.get('SELECT id, name, provider_host FROM sbc_trunks WHERE enabled');
  for (const t of troncales) {
    const d = disp[host(t.provider_host)];
    if (d) nodos['tr' + t.id] = componer('tr' + t.id, d.activo, d.latencia_ms, 'OPTIONS');
    else { const p = await pingIcmp(host(t.provider_host)); nodos['tr' + t.id] = componer('tr' + t.id, p.ok, p.ms, 'ping'); }
    avisarTransicion('tr' + t.id, nodos['tr' + t.id].ok, t.name || t.provider_host, 'troncal');
  }

  // gateway — ICMP (no habla SIP)
  try {
    const g = await gateway();
    if (g) { const p = await pingIcmp(g); nodos['gw'] = { ...componer('gw', p.ok, p.ms, 'ping'), ip: g }; }
  } catch (_) {}

  cache = { ts: Date.now(), nodos };
  return cache;
}

async function gateway() {
  const modo = await db.one("SELECT value FROM sbc_settings WHERE key='topo_gateway_modo'").catch(() => null);
  if (modo && modo.value && modo.value !== 'auto') return modo.value;
  const fijo = await db.one("SELECT value FROM sbc_settings WHERE key='topo_gateway_ip'").catch(() => null);
  if (fijo && fijo.value) return fijo.value;
  return new Promise((resolve) => {
    require('child_process').execFile('ip', ['route', 'show', 'default'], { timeout: 3000 }, (e, out) => {
      const m = String(out || '').match(/default via ([\d.]+)/);
      resolve(m ? m[1] : null);
    });
  });
}

const estado = () => cache;
function iniciar() { barrer().catch(() => {}); setInterval(() => barrer().catch(() => {}), CADA); }

module.exports = { iniciar, estado, barrer, gateway, mosDeLatencia };
