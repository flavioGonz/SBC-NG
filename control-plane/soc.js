'use strict';
/* ============================================================================
 *  SBC-NG · SOC — el centro de operaciones de seguridad del borde.
 *
 *  Todo lo que golpea el 5060 desde internet deja rastro: escaneos, fuerza bruta,
 *  INVITEs a números caros. El borde ya los frena (pike+ipban, secfilter), pero
 *  frenarlos sin verlos es volar a ciegas. Este módulo junta esos rastros en un solo
 *  lugar: quién ataca, desde qué país (con bandera), qué mitigación lo paró, y cuándo.
 *
 *  El estado real de los bloqueos vive en el htable `ipban` de Kamailio (memoria, se
 *  pierde al reiniciar). Acá lo espejamos a `sbc_blocked` (persistente), lo enriquecemos
 *  con geoip, y dejamos un evento por cada bloqueo nuevo para armar la línea de tiempo.
 * ==========================================================================*/
const db = require('./db');
const kam = require('./kamailio');
const seglog = require('./seglog');

/* ¿Estamos bajo ataque AHORA? Mira el buffer del registro en vivo (últimos 60 s) y
 * cuenta los eventos de seguridad (flood/ban/escáner/rechazo/fraude). Si el ritmo
 * supera el umbral, el panel prende la alarma "bajo ataque" con el ritmo y las IPs. */
const ATAQUE_UMBRAL = 12;   // eventos de seguridad en 60 s para considerarlo ataque
function detectarAtaque() {
  const ahora = Date.now();
  let rec = [];
  try { rec = (seglog.recientes() || []).filter((e) => (ahora - e.t) <= 60000); } catch (_) {}
  const rel = rec.filter((e) => ['flood', 'ban', 'secfilter', 'rechazo', 'fraude'].includes(e.tipo));
  const cnt = {};
  for (const e of rel) if (e.ip) cnt[e.ip] = (cnt[e.ip] || 0) + 1;
  const ips = Object.keys(cnt);
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  const porTipo = {};
  for (const e of rel) porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;
  return {
    activo: rel.length >= ATAQUE_UMBRAL,
    golpes_min: rel.length,
    ips: ips.length,
    top_ip: top ? top[0] : null,
    top_ip_golpes: top ? top[1] : 0,
    por_tipo: porTipo,
  };
}

/* ── geoip por ip-api.com (gratis, batch de 100, con cache) ─────────────────
 *  Un appliance no puede depender de tener una MaxMind actualizada; ip-api resuelve
 *  país/ISP sin bajar nada. Cache en memoria para no repreguntar la misma IP. */
const cacheGeo = new Map();
const esPublica = (ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip) &&
  !/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

async function geo(ips) {
  const faltan = [...new Set(ips)].filter((ip) => esPublica(ip) && !cacheGeo.has(ip));
  for (let i = 0; i < faltan.length; i += 100) {
    const lote = faltan.slice(i, i + 100).map((ip) => ({ query: ip, fields: 'status,country,countryCode,isp,query' }));
    try {
      const r = await fetch('http://ip-api.com/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lote), signal: AbortSignal.timeout(6000),
      });
      const arr = await r.json();
      for (const g of arr) {
        if (g && g.query) cacheGeo.set(g.query, { country: g.country || '?', cc: g.countryCode || '', isp: g.isp || '' });
      }
    } catch (_) { /* si ip-api no contesta, seguimos sin país; no es crítico */ }
  }
  const out = {};
  for (const ip of ips) out[ip] = cacheGeo.get(ip) || { country: null, cc: null, isp: null };
  return out;
}

/* Bandera emoji desde el código de país de 2 letras (UY -> 🇺🇾). */
function bandera(cc) {
  if (!cc || cc.length !== 2) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/* Aplana el dump del htable ipban a una lista de IPs. */
function ipsDeHtable(dump) {
  const ips = [];
  const slots = (dump && (dump.slots || dump.RECORDS)) || dump || [];
  const rec = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (/^\d+\.\d+\.\d+\.\d+$/.test(k)) ips.push(k);
      else if (typeof v === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(v)) ips.push(v);
      else if (v && typeof v === 'object') rec(v);
    }
  };
  rec(slots);
  return [...new Set(ips)];
}

/* Espeja el ipban de Kamailio a sbc_blocked + geoip + evento por bloqueo nuevo. */
async function sincronizar() {
  let dump = null;
  try { dump = await kam.htableGet('ipban'); } catch (_) {}
  const ips = ipsDeHtable(dump);
  if (!ips.length) return { nuevos: 0, total: 0 };

  const enBase = await db.get('SELECT ip, cc FROM sbc_blocked');
  const yaEsta = new Set(enBase.map((r) => r.ip));
  const sinCc = new Set(enBase.filter((r) => !r.cc).map((r) => r.ip));
  const nuevas = ips.filter((ip) => !yaEsta.has(ip));
  const info = await geo([...new Set([...nuevas, ...ips.filter((ip) => sinCc.has(ip))])]);

  // Países vetados (geo-bloqueo): si la IP viene de uno de estos, el motivo es "país no permitido".
  let geoSet = new Set();
  try { geoSet = new Set((await db.get('SELECT cc FROM sbc_geoblock')).map((r) => String(r.cc || '').toUpperCase())); } catch (_) {}
  const REASON_GEO = 'país no permitido (geo-bloqueo)';
  const REASON_FLOOD = 'anti-flood (pike/ipban)';
  const motivoDe = (cc) => (cc && geoSet.has(String(cc).toUpperCase())) ? REASON_GEO : REASON_FLOOD;

  // backfill del cc que faltaba en filas viejas
  for (const ip of ips.filter((ip) => sinCc.has(ip))) {
    const g = info[ip] || {};
    if (g.cc) await db.pool.query('UPDATE sbc_blocked SET cc=$2, country=COALESCE(country,$3), isp=COALESCE(isp,$4) WHERE ip=$1', [ip, g.cc, g.country || null, g.isp || null]);
  }

  let nuevos = 0;
  for (const ip of ips) {
    const g = info[ip] || {};
    const reason = motivoDe(g.cc);
    const res = await db.pool.query(
      `INSERT INTO sbc_blocked (ip, reason, country, cc, isp, hits, blocked_at)
       VALUES ($1, $5, $2, $3, $4, 1, now())
       ON CONFLICT (ip) DO UPDATE SET
         country = COALESCE(sbc_blocked.country, EXCLUDED.country),
         cc = COALESCE(sbc_blocked.cc, EXCLUDED.cc),
         isp = COALESCE(sbc_blocked.isp, EXCLUDED.isp)
       RETURNING (xmax = 0) AS insertado`,
      [ip, g.country || null, g.cc || null, g.isp || null, reason]);
    if (res.rows[0] && res.rows[0].insertado) {
      nuevos++;
      await db.pool.query(
        "INSERT INTO sbc_events (tenant_id, kind, severity, detail) VALUES (1,'bloqueo','warn',$1)",
        [JSON.stringify({ ip, pais: g.country || '?', cc: g.cc || '', isp: g.isp || '', motivo: reason })]);
    }
  }

  // Reetiqueta filas ya conocidas cuyo país entró (o salió) de la lista de geo-bloqueo,
  // para que el motivo del SOC siga siempre coherente con la configuración vigente.
  if (geoSet.size) {
    const inList = [...geoSet];
    await db.pool.query(
      `UPDATE sbc_blocked SET reason=$1 WHERE upper(cc)=ANY($2) AND reason=$3`,
      [REASON_GEO, inList, REASON_FLOOD]);
    await db.pool.query(
      `UPDATE sbc_blocked SET reason=$1 WHERE (cc IS NULL OR NOT (upper(cc)=ANY($2))) AND reason=$3`,
      [REASON_FLOOD, inList, REASON_GEO]);
  } else {
    await db.pool.query(`UPDATE sbc_blocked SET reason=$1 WHERE reason=$2`, [REASON_FLOOD, REASON_GEO]);
  }
  return { nuevos, total: ips.length };
}

/* El resumen que consume el panel: KPIs, bloqueos con bandera, top países/atacantes,
 * y la línea de tiempo de eventos de seguridad. */
async function resumen() {
  await sincronizar().catch(() => {});

  const bloqueos = await db.get('SELECT * FROM sbc_blocked ORDER BY blocked_at DESC LIMIT 500');
  const conBandera = bloqueos.map((b) => { const cc = b.cc || (cacheGeo.get(b.ip) || {}).cc || null; return { ...b, cc, flag: bandera(cc || '') }; });

  const porPais = {};
  for (const b of conBandera) { const p = b.country || 'Desconocido'; porPais[p] = porPais[p] || { pais: p, cc: b.cc, flag: b.flag, n: 0 }; porPais[p].n++; }
  const topPaises = Object.values(porPais).sort((a, b) => b.n - a.n).slice(0, 12);

  const topAtacantes = [...conBandera].sort((a, b) => (b.hits || 0) - (a.hits || 0)).slice(0, 10);

  const eventos = await db.get(
    "SELECT id, kind, severity, detail, created_at FROM sbc_events WHERE kind IN ('bloqueo','ataque','mitigacion','motor','red') ORDER BY id DESC LIMIT 100");

  // secfilter: cuántas reglas de mitigación hay puestas
  let mitigaciones = 0;
  try { const m = await db.one('SELECT count(*)::int n FROM secfilter'); mitigaciones = m ? m.n : 0; } catch (_) {}

  const desde24 = await db.one("SELECT count(*)::int n FROM sbc_events WHERE kind='bloqueo' AND created_at > now() - interval '24 hours'");

  return {
    kpis: {
      bloqueados: conBandera.length,
      permanentes: conBandera.filter((b) => b.permanent).length,
      ultimas_24h: (desde24 && desde24.n) || 0,
      paises: topPaises.length,
      mitigaciones,
    },
    bloqueos: conBandera,
    top_paises: topPaises,
    top_atacantes: topAtacantes,
    eventos,
    ataque: detectarAtaque(),
  };
}

function iniciar() {
  sincronizar().catch(() => {});
  setInterval(() => sincronizar().catch(() => {}), 30000);
}

module.exports = { iniciar, sincronizar, resumen, geo, bandera };
