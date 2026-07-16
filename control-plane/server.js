'use strict';
/* ============================================================================
 *  SBC-NG · control-plane
 *
 *  La API norte: lo único que una central necesita saber del SBC. PBX-NG la
 *  consume igual que la consumiría un 3CX o un FreePBX — el SBC no sabe (ni le
 *  importa) qué central tiene detrás.
 *
 *  Autenticación: token Bearer (tabla sbc_api_tokens) para la API norte, y JWT
 *  para el panel. Deny-by-default: todo lo que no esté explícitamente abierto
 *  necesita credencial.
 * ==========================================================================*/
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const db = require('./db');
const kam = require('./kamailio');
const rtp = require('./rtpengine');
const net = require('./network');
const netmode = require('./netmode');
const cfgen = require('./config');
const motores = require('./docker');
const publica = require('./publica');
const monitor = require('./monitor');
const correo = require('./email');
const soc = require('./soc');
const { Server: IOServer } = require('socket.io');
const seglog = require('./seglog');

const PORT = +(process.env.PORT || 3100);

/* El secreto del JWT tiene que sobrevivir a un reinicio: si se regenera, todas las
 * sesiones abiertas del panel se caen al primer `docker restart`. Si no viene por
 * entorno, lo guardamos en sbc_settings la primera vez y lo reusamos siempre. */
let JWT_SECRET = process.env.JWT_SECRET || '';
async function secretoJwt() {
  if (JWT_SECRET) return JWT_SECRET;
  try {
    const row = await db.one("SELECT value FROM sbc_settings WHERE key='jwt_secret'");
    if (row && row.value) { JWT_SECRET = row.value; return JWT_SECRET; }
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
    await db.pool.query("INSERT INTO sbc_settings (key, value) VALUES ('jwt_secret', $1) ON CONFLICT (key) DO NOTHING", [JWT_SECRET]);
    const r2 = await db.one("SELECT value FROM sbc_settings WHERE key='jwt_secret'");
    if (r2 && r2.value) JWT_SECRET = r2.value;
  } catch (_) {
    JWT_SECRET = JWT_SECRET || crypto.randomBytes(32).toString('hex');
  }
  return JWT_SECRET;
}

const app = express();
app.use(express.json({ limit: '16mb' }));  // los screenshots pegados en Manuales pueden pesar

/* ─────────────── auth ─────────────── */

// Público: sólo la salud y el login del panel.
// --- Imagenes de los manuales: servidas desde el volumen persistente. GET es PUBLICO
// (el <img> del manual no puede mandar token); el POST de mas abajo si exige sesion.
const _fs = require('fs'); const _path = require('path');
const MAN_IMG_DIR = _path.join(process.env.CONF_DIR || '/etc/sbcng', 'manuales-img');
const IMG_OK = /^[a-z0-9][a-z0-9._-]{1,80}\.(png|jpe?g|webp|gif)$/i;
const IMG_MIME = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif' };
app.get('/api/v1/manuales/img/:name', (req, res) => {
  const name = req.params.name;
  if (!IMG_OK.test(name)) return res.status(400).end();
  const f = _path.join(MAN_IMG_DIR, name);
  if (!f.startsWith(MAN_IMG_DIR) || !_fs.existsSync(f)) return res.status(404).end();
  res.set('Content-Type', IMG_MIME[_path.extname(name).toLowerCase()] || 'application/octet-stream');
  res.set('Cache-Control', 'no-store');   // recien subida -> se ve al recargar
  _fs.createReadStream(f).pipe(res);
});

// El certificado STIR se publica SIN auth: es la URL x5u que el verificador (de la otra
// punta) descarga para chequear la firma. Es informacion publica por diseno.
app.get('/api/v1/stir/cert.pem', async (req, res) => {
  try {
    const r = await db.get('SELECT cert_pem FROM sbc_stir WHERE id=1');
    const pem = r && r[0] && r[0].cert_pem;
    if (!pem) return res.status(404).end();
    res.set('Content-Type', 'application/x-pem-file'); res.set('Cache-Control', 'no-store');
    res.send(pem);
  } catch (e) { res.status(500).end(); }
});

const PUBLICO = [/^\/health$/, /^\/api\/v1\/auth\/login$/, /^\/api\/v1\/auth\/setup$/, /^\/api\/v1\/stir\/cert\.pem$/];

app.use(async (req, res, next) => {
  if (PUBLICO.some(rx => rx.test(req.path))) return next();

  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) return res.status(401).json({ error: 'falta el token' });

  // 1) ¿Es un token de la API norte? (el que usa la central)
  try {
    const t = await db.one('SELECT id, tenant_id, name FROM sbc_api_tokens WHERE token=$1', [tok]);
    if (t) {
      db.pool.query('UPDATE sbc_api_tokens SET last_used=now() WHERE id=$1', [t.id]).catch(() => {});
      req.auth = { tipo: 'api', tenant_id: t.tenant_id, name: t.name };
      return next();
    }
  } catch (_) {}

  // 2) ¿Es un JWT del panel?
  try {
    req.auth = { tipo: 'panel', ...jwt.verify(tok, await secretoJwt()) };
    return next();
  } catch (_) {}

  return res.status(401).json({ error: 'token inválido' });
});

const tenant = (req) => (req.auth && req.auth.tenant_id) || 1;

/* ─────────────── salud y estado ─────────────── */

app.get('/health', async (req, res) => {
  let base = false;
  try { await db.pool.query('SELECT 1'); base = true; } catch (_) {}
  res.json({ ok: true, producto: 'SBC-NG', version: require('fs').readFileSync('/app/VERSION', 'utf8').trim(), db: base });
});

app.get('/api/v1/status', async (req, res) => {
  const [ver, up, rtpOk] = await Promise.all([
    kam.version().catch(() => null),
    kam.uptime().catch(() => null),
    rtp.ping().then(() => true).catch(() => false),
  ]);
  const pbx = await db.get('SELECT id, name, sip_uri, enabled, last_seen FROM sbc_pbx WHERE tenant_id=$1', [tenant(req)]);
  res.json({
    kamailio: ver ? { ok: true, version: ver, uptime: up } : { ok: false },
    rtpengine: { ok: rtpOk },
    centrales: pbx,
  });
});

app.get('/api/v1/metrics', async (req, res) => {
  try {
    const s = await kam.stats().catch(() => ({}));
    const bloqueos = await db.one('SELECT count(*)::int AS n FROM sbc_blocked');
    res.json({
      ts: Date.now(),
      sip: s,
      bloqueos: bloqueos ? bloqueos.n : 0,
      rtp: await rtp.estadisticas().catch(() => null),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Recursos del appliance: host (CPU/mem/disco/uptime) + contenedores del stack.
app.get('/api/v1/system', async (req, res) => {
  const os = require('os');
  const host = { uptime: os.uptime(), load: os.loadavg()[0], cpus: os.cpus().length,
                 mem_total: os.totalmem(), mem_free: os.freemem() };
  try {
    const { execFileSync } = require('child_process');
    const l = execFileSync('df', ['-kP', '/']).toString().trim().split('\n').pop().split(/\s+/);
    host.disk_total = (+l[1]) * 1024; host.disk_used = (+l[2]) * 1024;
  } catch (_) {}
  let contenedores = [];
  try { contenedores = await motores.contenedores(); } catch (_) {}
  res.json({ host, contenedores });
});

// Conteos para los badges del menú: una sola consulta liviana, tolerante a fallos.
app.get('/api/v1/counts', async (req, res) => {
  const uno = async (sql) => { try { const r = await db.one(sql); return (r && r.n) || 0; } catch (_) { return 0; } };
  res.json({
    extensiones: await uno('SELECT count(*)::int AS n FROM sbc_endpoints'),
    troncales:   await uno('SELECT count(*)::int AS n FROM sbc_trunks'),
    centrales:   await uno('SELECT count(*)::int AS n FROM sbc_pbx'),
    rutas:       await uno('SELECT count(*)::int AS n FROM sbc_routes'),
    reglas:      await uno('SELECT count(*)::int AS n FROM sbc_sip_rules'),
  });
});

/* ─────────────── attach: declarar la central que va detrás ─────────────── */

app.post('/api/v1/attach', async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.sip_uri) return res.status(400).json({ error: 'name y sip_uri son obligatorios' });
  try {
    const uri = String(b.sip_uri).replace(/^sip:/, '');
    const ip = uri.split(':')[0];
    const row = await db.one(
      `INSERT INTO sbc_pbx (tenant_id, name, sip_uri, priority, context, secret)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, sip_uri, priority`,
      [tenant(req), b.name, b.sip_uri, b.priority || 10, b.context || 'from-trunk',
       b.secret || crypto.randomBytes(16).toString('hex')]);

    // La central pasa a ser un destino del dispatcher (entrantes) y una IP de confianza (salientes).
    await db.pool.query(
      'INSERT INTO dispatcher (setid, destination, priority, description) VALUES (1, $1, $2, $3)',
      ['sip:' + uri, b.priority || 10, b.name]);
    await db.pool.query(
      'INSERT INTO address (grp, ip_addr, mask, tag) VALUES (1, $1, 32, $2)', [ip, b.name]);

    await kam.dispatcherReload().catch(() => {});
    await db.pool.query("INSERT INTO sbc_events (tenant_id, kind, detail) VALUES ($1,'attach',$2)",
      [tenant(req), JSON.stringify({ name: b.name, sip_uri: b.sip_uri })]);

    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/v1/pbx', async (req, res) => {
  res.json(await db.get('SELECT * FROM sbc_pbx WHERE tenant_id=$1 ORDER BY priority', [tenant(req)]));
});


/* Editar una central ya enganchada.
 *
 * Ojo: la central no vive solo en sbc_pbx. Vive en TRES lugares — sbc_pbx (lo que ve
 * el panel), dispatcher (a donde mandarle las entrantes) y address (de donde le
 * aceptamos las salientes). Si se edita uno solo, el SBC dice una cosa y hace otra:
 * la pantalla muestra la IP nueva y las llamadas siguen yendo a la vieja. Por eso las
 * tres se rehacen juntas. */
app.put('/api/v1/pbx/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const previo = await db.one('SELECT * FROM sbc_pbx WHERE id=$1 AND tenant_id=$2', [req.params.id, tenant(req)]);
    if (!previo) return res.status(404).json({ error: 'esa central no existe' });

    const row = await db.one(
      'UPDATE sbc_pbx SET name=COALESCE($1,name), sip_uri=COALESCE($2,sip_uri), priority=COALESCE($3,priority), ' +
      'context=COALESCE($4,context), enabled=COALESCE($5,enabled) WHERE id=$6 RETURNING *',
      [b.name || null, b.sip_uri || null, b.priority || null, b.context || null,
       b.enabled === undefined ? null : !!b.enabled, req.params.id]);

    const uriVieja = String(previo.sip_uri).replace(/^sip:/, '');
    await db.pool.query('DELETE FROM dispatcher WHERE destination=$1', ['sip:' + uriVieja]);
    await db.pool.query('DELETE FROM address WHERE ip_addr=$1', [uriVieja.split(':')[0]]);

    if (row.enabled) {
      const uri = String(row.sip_uri).replace(/^sip:/, '');
      await db.pool.query('INSERT INTO dispatcher (setid, destination, priority, description) VALUES (1,$1,$2,$3)',
        ['sip:' + uri, row.priority || 10, row.name]);
      await db.pool.query('INSERT INTO address (grp, ip_addr, mask, tag) VALUES (1,$1,32,$2)',
        [uri.split(':')[0], row.name]);
    }
    await kam.dispatcherReload().catch(() => {});
    await db.pool.query("INSERT INTO sbc_events (tenant_id, kind, detail) VALUES ($1,'pbx_edit',$2)",
      [tenant(req), JSON.stringify({ id: row.id, name: row.name, sip_uri: row.sip_uri, enabled: row.enabled })]);
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/v1/pbx/:id', async (req, res) => {
  try {
    const p = await db.one('SELECT * FROM sbc_pbx WHERE id=$1 AND tenant_id=$2', [req.params.id, tenant(req)]);
    if (!p) return res.status(404).json({ error: 'esa central no existe' });
    const uri = String(p.sip_uri).replace(/^sip:/, '');
    await db.pool.query('DELETE FROM dispatcher WHERE destination=$1', ['sip:' + uri]);
    await db.pool.query('DELETE FROM address WHERE ip_addr=$1', [uri.split(':')[0]]);
    await db.pool.query('DELETE FROM sbc_pbx WHERE id=$1', [req.params.id]);
    await kam.dispatcherReload().catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────── troncales ─────────────── */

app.get('/api/v1/trunks', async (req, res) => {
  const rows = await db.get('SELECT * FROM sbc_trunks WHERE tenant_id=$1 ORDER BY id', [tenant(req)]);
  res.json(rows.map(({ password, ...t }) => ({ ...t, tiene_password: !!password })));
});

app.post('/api/v1/trunks', async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'el nombre es obligatorio' });
  if (b.mode !== 'webrtc-client' && !b.provider_host) return res.status(400).json({ error: 'provider_host es obligatorio' });
  if (b.mode === 'webrtc-client' && !b.remote_url) return res.status(400).json({ error: 'una troncal WebRTC-cliente necesita la URL wss:// remota' });
  try {
    const row = await db.one(
      `INSERT INTO sbc_trunks (tenant_id,name,provider_host,provider_port,transport,mode,username,password,realm,
                               from_user,from_domain,codecs,dtmf,session_timers,max_calls,dids,
                               outbound_strip,outbound_prefix,remote_url,gateway_ip,gateway_dev)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id, name`,
      [tenant(req), b.name, b.provider_host || (b.remote_url ? '(webrtc)' : ''), b.provider_port || 5060, b.transport || 'udp',
       b.mode || 'register', b.username || null, b.password || null, b.realm || null,
       b.from_user || null, b.from_domain || null, b.codecs || 'ulaw,alaw,g729,opus',
       b.dtmf || 'rfc4733', !!b.session_timers, b.max_calls || 0, b.dids || [],
       +b.outbound_strip || 0, b.outbound_prefix || '', b.remote_url || '', b.gateway_ip || null, b.gateway_dev || null]);
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Estado del puente WebRTC-cliente (lo escribe el contenedor wsbridge). */
app.get('/api/v1/wsbridge/status', async (req, res) => {
  try {
    const s = await db.get('SELECT name, state, detail, extract(epoch from (now()-updated_at))::int AS hace_seg FROM sbc_wsbridge_status ORDER BY name');
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────── troncales: editar y borrar ─────────────── */

app.put('/api/v1/trunks/:id', async (req, res) => {
  const b = req.body || {};
  const campos = ['name', 'provider_host', 'provider_port', 'transport', 'mode', 'username', 'password',
                  'realm', 'from_user', 'from_domain', 'codecs', 'dtmf', 'session_timers', 'max_calls',
                  'outbound_strip', 'outbound_prefix', 'enabled', 'remote_url', 'gateway_ip', 'gateway_dev'];
  const sets = [];
  const args = [];
  for (const c of campos) {
    if (b[c] === undefined) continue;
    // La contrasena vacia significa "no la toques", no "borrala": el panel nunca la
    // muestra, asi que si la mandara vacia la borrariamos cada vez que alguien edita.
    if (c === 'password' && !b[c]) continue;
    args.push(b[c]);
    sets.push(`${c}=$${args.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'no mandaste nada para cambiar' });
  args.push(+req.params.id, tenant(req));
  try {
    const r = await db.one(
      `UPDATE sbc_trunks SET ${sets.join(',')} WHERE id=$${args.length - 1} AND tenant_id=$${args.length} RETURNING id, name`, args);
    if (!r) return res.status(404).json({ error: 'esa troncal no existe' });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/v1/trunks/:id', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM sbc_trunks WHERE id=$1 AND tenant_id=$2', [+req.params.id, tenant(req)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────── ruteo de salida (que numero sale por que troncal) ───────────────
 *
 * Una regla es: "los numeros que empiezan con X salen por la troncal Y". Si hay dos
 * reglas para el mismo prefijo, la de prioridad mas baja va primero y la otra queda
 * de respaldo: si el operador contesta con un error, el failover baja a la siguiente.
 */
const ruteo = require('./ruteo');

app.get('/api/v1/routes', async (req, res) => {
  try {
    res.json(await db.get(
      `SELECT r.*, t.name AS trunk_name, t.provider_host
         FROM sbc_routes r LEFT JOIN sbc_trunks t ON t.id = r.trunk_id
        WHERE r.tenant_id=$1 ORDER BY r.priority, r.id`, [tenant(req)]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/routes', async (req, res) => {
  const b = req.body || {};
  if (!b.trunk_id) return res.status(400).json({ error: 'hay que decir por que troncal sale' });
  try {
    const r = await db.one(
      `INSERT INTO sbc_routes (tenant_id, name, pattern, trunk_id, strip, prepend, priority, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [tenant(req), b.name || null, b.pattern || '', +b.trunk_id, +b.strip || 0,
       b.prepend || null, +b.priority || 10, b.enabled !== false]);
    res.status(201).json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/v1/routes/:id', async (req, res) => {
  const b = req.body || {};
  const campos = ['name', 'pattern', 'trunk_id', 'strip', 'prepend', 'priority', 'enabled'];
  const sets = []; const args = [];
  for (const c of campos) {
    if (b[c] === undefined) continue;
    args.push(b[c]); sets.push(`${c}=$${args.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'nada para cambiar' });
  args.push(+req.params.id, tenant(req));
  try {
    const r = await db.one(`UPDATE sbc_routes SET ${sets.join(',')} WHERE id=$${args.length-1} AND tenant_id=$${args.length} RETURNING id`, args);
    if (!r) return res.status(404).json({ error: 'esa regla no existe' });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/v1/routes/:id', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM sbc_routes WHERE id=$1 AND tenant_id=$2', [+req.params.id, tenant(req)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Aplicar = volcar troncales y rutas a las tablas de Kamailio y recargarlas. Hasta que
// no se aplica, lo de la pantalla es una intencion, no una configuracion.
app.post('/api/v1/routes/apply', async (req, res) => {
  try { res.json(await ruteo.aplicar(tenant(req))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Lo que el motor tiene AHORA. Si esto no coincide con la pantalla, el reload no entro.
app.get('/api/v1/routes/live', async (req, res) => {
  try { res.json(await ruteo.enVivo()); } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────── CDR propio del borde (tabla acc) ───────────────
 *
 * El módulo acc de Kamailio deja una fila por transacción: el INVITE con su código
 * final (200 = atendida, 4xx/5xx = no) y el BYE con la hora de corte. Acá las cruzamos
 * por Call-ID para armar el registro de llamada: origen, destino, inicio, duración y
 * cómo terminó. Es el CDR del SBC, independiente del de la central.
 */
app.get('/api/v1/cdr', async (req, res) => {
  const limite = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
  try {
    const filas = await db.get(
      `SELECT callid,
              max(time) FILTER (WHERE method='INVITE') AS inicio,
              max(time) FILTER (WHERE method='BYE')    AS fin,
              max(sip_code)   FILTER (WHERE method='INVITE') AS codigo,
              max(sip_reason) FILTER (WHERE method='INVITE') AS razon,
              max(src)   FILTER (WHERE method='INVITE') AS src,
              max(dst)   FILTER (WHERE method='INVITE') AS dst,
              max(srcip) FILTER (WHERE method='INVITE') AS srcip
         FROM acc
        GROUP BY callid
        ORDER BY max(time) DESC
        LIMIT $1`, [limite]);
    const cdr = filas.map((r) => {
      const cod = parseInt(r.codigo, 10) || 0;
      const atendida = cod >= 200 && cod < 300;
      const dur = (atendida && r.inicio && r.fin) ? Math.max(0, Math.round((new Date(r.fin) - new Date(r.inicio)) / 1000)) : 0;
      return {
        callid: r.callid, src: r.src, dst: r.dst, srcip: r.srcip,
        inicio: r.inicio, fin: r.fin, codigo: cod, razon: r.razon,
        duracion: dur,
        resultado: atendida ? 'atendida' : (cod === 487 ? 'cancelada' : (cod ? 'no contestó' : 'en curso')),
      };
    });
    res.json(cdr);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────── correo saliente (SMTP) ─────────────── */
app.get('/api/v1/email', async (req, res) => {
  try { res.json(await correo.leer()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/v1/email', async (req, res) => {
  try { res.json(await correo.guardar(req.body || {})); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/v1/email/test', async (req, res) => {
  const to = (req.body || {}).to;
  if (!to) return res.status(400).json({ error: 'falta el destinatario' });
  try { res.json(await correo.probar(to)); } catch (e) { res.status(400).json({ error: correo.pista(e) }); }
});

// --- Notificaciones: qué eventos avisan por correo y a quién ---
app.get('/api/v1/notif', async (req, res) => {
  try { res.json(await correo.leerNotif()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/v1/notif', async (req, res) => {
  try { res.json(await correo.guardarNotif(req.body || {})); } catch (e) { res.status(500).json({ error: e.message }); }
});
// Preview del template de un evento (HTML), para el panel.
app.get('/api/v1/notif/preview', (req, res) => {
  const ev = String(req.query.evento || 'security.attack');
  res.json({ html: correo.renderEvento(ev, {}) });
});
// Enviar un ejemplo de ese evento (usa el destinatario configurado o el que se pase).
app.post('/api/v1/notif/test', async (req, res) => {
  const b = req.body || {};
  try {
    const cfg = await correo.leerNotif();
    const to = b.to || cfg.alert_to;
    if (!to) return res.status(400).json({ error: 'no hay destinatario configurado (cargá uno arriba o pasá uno)' });
    await correo.probarEvento(to, b.evento || 'security.attack');
    res.json({ ok: true, to });
  } catch (e) { res.status(400).json({ error: correo.pista(e) }); }
});

/* ─────────────── diagnostico: ping y traceroute ───────────────
 *
 * "¿Desde el SBC se llega al operador?" es la primera pregunta de casi cualquier
 * problema, y la respuesta la tiene el equipo, no el que mira el panel.
 */
const diag = require('./diag');
const diagtrunk = require('./diagtrunk');

// El token de /metrics lo generamos NOSOTROS (montamos /etc/sbcng en RW; kamailio lo lee).
(function ensureMetricsToken() {
  try {
    const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
    const dir = process.env.CONF_DIR || '/etc/sbcng';
    const tf = path.join(dir, 'metrics.token');
    if (!fs.existsSync(tf) || !fs.readFileSync(tf, 'utf8').trim()) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tf, crypto.randomBytes(16).toString('hex'));
    }
  } catch (e) { console.error('[SBC-NG] no pude generar metrics.token:', e.message); }
})();

// --- Observabilidad: Prometheus. Kamailio 6.x expone /metrics (xhttp_prom) en el 8088,
// protegido por un token que comparte con nosotros vía el volumen /etc/sbcng. Nosotros lo
// scrapeamos y lo re-exponemos bajo NUESTRA auth (Bearer), que es lo que scrapea Grafana. ---
const _http = require('http');
const _fs2 = require('fs');
const _path2 = require('path');
function metricsToken() {
  try { return _fs2.readFileSync(_path2.join(process.env.CONF_DIR || '/etc/sbcng', 'metrics.token'), 'utf8').trim(); }
  catch (_) { return ''; }
}
function scrapeKamailio() {
  return new Promise((ok, err) => {
    const tok = metricsToken();
    if (!tok) return err(new Error('token de metrics no disponible (kamailio no arrancó aún)'));
    const req = _http.get(`http://127.0.0.1:8088/metrics?token=${tok}`, { timeout: 4000 }, (r) => {
      let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => (r.statusCode === 200 ? ok(b) : err(new Error('kamailio /metrics HTTP ' + r.statusCode))));
    });
    req.on('error', err); req.on('timeout', () => { req.destroy(); err(new Error('timeout')); });
  });
}

// Target de scrape de Grafana: Prometheus en texto plano, detrás del Bearer del panel.
app.get('/api/v1/prometheus', async (req, res) => {
  try { res.type('text/plain; version=0.0.4').send(await scrapeKamailio()); }
  catch (e) { res.status(503).type('text/plain').send('# ' + e.message + '\n'); }
});

// Datos para el panel de Capacidades: estado + muestra de métricas.
app.get('/api/v1/observabilidad', async (req, res) => {
  let activo = false, total = 0, muestra = [];
  try {
    const txt = await scrapeKamailio();
    activo = true;
    const lineas = txt.split('\n').filter((l) => l && !l.startsWith('#'));
    total = lineas.length;
    muestra = lineas.slice(0, 12);
  } catch (_) {}
  res.json({
    prometheus: {
      activo, total_metricas: total, muestra,
      endpoint_grafana: '/backend/api/v1/prometheus',
      nota: 'Configurá Grafana con este endpoint y el Bearer del panel como Authorization.',
    },
  });
});

// Diagnóstico de una troncal ANTES de guardarla: DNS, puerto, SIP/WSS. No toca la
// base; solo prueba con lo que el formulario tiene cargado y devuelve los pasos.
app.post('/api/v1/trunks/diagnose', async (req, res) => {
  try { res.json(await diagtrunk.diagnosticar(req.body || {})); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/network/ping', async (req, res) => {
  try { res.json(await diag.ping((req.body || {}).host)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/v1/network/trace', async (req, res) => {
  try { res.json(await diag.trace((req.body || {}).host)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

/* ─────────────── seguridad ─────────────── */

/* ─────────────── listas negras y blancas (secfilter) ───────────────
 *
 * El ipban del pike bloquea al que INSISTE. Esto bloquea al que se DELATA: el que
 * viene con User-Agent "sipvicious", el que marca a un destino caro, el que llega
 * desde una IP que ya conocemos. Es barato — se descarta antes de cualquier
 * procesamiento — y es la primera linea del borde.
 *
 * action: 0 = lista negra (bloquear), 1 = lista blanca (dejar pasar siempre).
 * type:   0 = User-Agent, 1 = pais, 2 = dominio, 3 = IP, 4 = usuario.
 */
const SECF_TIPOS = { 0: 'user-agent', 1: 'pais', 2: 'dominio', 3: 'ip', 4: 'usuario' };

app.get('/api/v1/security/filters', async (req, res) => {
  try {
    const filas = await db.get('SELECT id, action, type, data FROM secfilter ORDER BY action, type, data');
    res.json(filas.map((f) => ({ ...f, tipo: SECF_TIPOS[f.type] || String(f.type), lista: f.action ? 'blanca' : 'negra' })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/security/filters', async (req, res) => {
  const b = req.body || {};
  const dato = String(b.data || '').trim();
  if (!dato) return res.status(400).json({ error: 'falta el dato a filtrar' });
  const tipo = +b.type || 0;
  if (!SECF_TIPOS[tipo]) return res.status(400).json({ error: 'ese tipo de filtro no existe' });
  try {
    await db.pool.query(
      'INSERT INTO secfilter (action, type, data) VALUES ($1,$2,$3) ON CONFLICT (action,type,data) DO NOTHING',
      [b.action ? 1 : 0, tipo, dato]);
    // Sin el reload la fila esta en la base y el motor la ignora: el clasico "pero si lo agregue".
    await kam.secfilterReload().catch(() => {});
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/v1/security/filters/:id', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM secfilter WHERE id=$1', [+req.params.id]);
    await kam.secfilterReload().catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* El panel SOC: KPIs, bloqueos con bandera, top paises/atacantes y timeline. */
app.get('/api/v1/soc', async (req, res) => {
  try { res.json(await soc.resumen()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/v1/security/blocked', async (req, res) => {
  res.json(await db.get('SELECT * FROM sbc_blocked ORDER BY blocked_at DESC LIMIT 500'));
});

app.post('/api/v1/security/unblock', async (req, res) => {
  const ip = (req.body && req.body.ip) || '';
  if (!ip) return res.status(400).json({ error: 'falta la ip' });
  try {
    await db.pool.query('DELETE FROM sbc_blocked WHERE ip=$1', [ip]);
    await kam.htableDelete('ipban', ip).catch(() => {});
    res.json({ ok: true, ip });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────── red: las dos patas del SBC ─────────────── */

app.get('/api/v1/network', async (req, res) => {
  try {
    const [ifaces, rutas] = await Promise.all([Promise.resolve(net.conTasas()), net.rutas()]);
    const wan = ifaces.find((i) => i.rol === 'wan') || null;
    res.json({
      interfaces: ifaces,
      rutas,
      resumen: {
        wan: wan ? wan.name : null,
        wan_ok: !!(wan && wan.estado === 'conectada'),
        caidas: ifaces.filter((i) => i.estado !== 'conectada').map((i) => i.name),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────── registros SIP en vivo ───────────────
 *
 * `ul.dump` devuelve el árbol crudo de usrloc (Domains → AoRs → Contacts), que es
 * ilegible para una tabla. Lo aplanamos acá: una fila por contacto, que es lo que
 * un técnico quiere ver ("¿el 1004 está registrado, desde dónde y con qué teléfono?").
 */
app.get('/api/v1/registrations', async (req, res) => {
  try {
    // El SBC es proxy de registro: usrloc esta vacio a proposito (la central es la que
    // guarda a los usuarios). Lo que si tenemos es lo que VIMOS pasar: cada REGISTER que
    // la central contesto con 200 quedo anotado en sbc_endpoints, con la IP real de donde
    // vino. Eso es lo que se muestra.
    const filas = await db.get(
      `SELECT *, EXTRACT(EPOCH FROM (now() - last_seen))::int AS hace_seg
         FROM sbc_endpoints WHERE tenant_id=$1 ORDER BY last_seen DESC LIMIT 500`, [tenant(req)]);
    // Vivo = lo vimos hace menos de 2 minutos (un telefono re-registra cada 60 s o menos).
    const registros = filas.map((f) => ({ ...f, vivo: f.hace_seg < 120 }));
    res.json({ total: registros.length, vivos: registros.filter((r) => r.vivo).length, registros });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Olvidar una extension (se fue, cambio de telefono, quedo colgada).
app.delete('/api/v1/registrations/:id', async (req, res) => {
  await db.pool.query('DELETE FROM sbc_endpoints WHERE id=$1 AND tenant_id=$2', [req.params.id, tenant(req)]);
  res.json({ ok: true });
});

/* ═══════════════ MODO DE RED: router o switch ═══════════════════════════════ */

async function interfacesConRol() {
  const reales = net.conTasas();
  const filas = await db.get('SELECT * FROM sbc_iface');
  const porNombre = Object.fromEntries(filas.map((f) => [f.name, f]));
  return reales.map((i) => {
    const g = porNombre[i.name] || {};
    return {
      ...i,
      rol: g.rol || i.rol,
      modo: g.modo || 'dhcp',
      ip_config: g.ip || null,
      gateway: g.gateway || null,
      vlan: g.vlan || null,
      notas: g.notas || null,
      configurada: !!porNombre[i.name],
    };
  });
}

app.get('/api/v1/network/config', async (req, res) => {
  try {
    const cfg = await db.one('SELECT * FROM sbc_net WHERE id=1');
    res.json({
      cfg,
      interfaces: await interfacesConRol(),
      rutas: await net.rutas(),                                   // lo que hay en el kernel AHORA
      estaticas: await db.get('SELECT * FROM sbc_net_routes WHERE tenant_id=$1 ORDER BY metrica, id', [tenant(req)]),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/v1/network/config', async (req, res) => {
  const b = req.body || {};
  if (b.modo && !['router', 'switch'].includes(b.modo)) return res.status(400).json({ error: 'el modo es router o switch' });
  try {
    await db.pool.query(
      'UPDATE sbc_net SET modo=COALESCE($1,modo), wan_if=$2, lan_if=$3, nat=COALESCE($4,nat), forward=COALESCE($5,forward), bridge=COALESCE($6,bridge) WHERE id=1',
      [b.modo || null, b.wan_if || null, b.lan_if || null,
       b.nat === undefined ? null : !!b.nat, b.forward === undefined ? null : !!b.forward, b.bridge || null]);

    for (const i of (b.interfaces || [])) {
      if (!i.name) continue;
      await db.pool.query(
        'INSERT INTO sbc_iface (name, rol, modo, ip, gateway, vlan, notas, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now()) ' +
        'ON CONFLICT (name) DO UPDATE SET rol=EXCLUDED.rol, modo=EXCLUDED.modo, ip=EXCLUDED.ip, gateway=EXCLUDED.gateway, vlan=EXCLUDED.vlan, notas=EXCLUDED.notas, updated_at=now()',
        [i.name, i.rol || 'sin_uso', i.modo || 'dhcp', i.ip_config || i.ip || null, i.gateway || null, i.vlan || null, i.notas || null]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/network/plan', async (req, res) => {
  try {
    const cfg = { ...(await db.one('SELECT * FROM sbc_net WHERE id=1')), ...(req.body || {}) };
    const ifaces = await interfacesConRol();
    const rutas = await db.get('SELECT * FROM sbc_net_routes WHERE tenant_id=$1 ORDER BY metrica', [tenant(req)]);
    res.json({ modo: cfg.modo, pasos: netmode.plan(cfg, ifaces, rutas) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/v1/network/apply', async (req, res) => {
  if (!req.body || req.body.confirmar !== true) {
    return res.status(400).json({ error: 'hay que confirmar: aplicar el modo de red puede cortar la conexion con el panel' });
  }
  try {
    const cfg = { ...(await db.one('SELECT * FROM sbc_net WHERE id=1')) };
    cfg.interfaces = await interfacesConRol();
    cfg.rutas = await db.get('SELECT * FROM sbc_net_routes WHERE tenant_id=$1 ORDER BY metrica', [tenant(req)]);
    const r = await netmode.aplicar(cfg);
    if (r.ok) {
      await db.pool.query('UPDATE sbc_net SET aplicado_at=now(), aplicado_por=$1 WHERE id=1',
        [(req.auth && req.auth.username) || 'api']);
    }
    await db.pool.query("INSERT INTO sbc_events (tenant_id, kind, severity, detail) VALUES (1,'red',$1,$2)",
      [r.ok ? 'info' : 'crit', JSON.stringify({ modo: cfg.modo, ok: r.ok, fallo: r.fallo || null })]);
    res.status(r.ok ? 200 : 500).json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════ MEDIOS: rtpengine ══════════════════════════════════════════ */

app.get('/api/v1/media', async (req, res) => {
  const m = await db.one('SELECT * FROM sbc_media WHERE id=1');
  const vivo = await rtp.estadisticas().catch(() => null);
  res.json({ cfg: m, motor: { ok: !!vivo, ...(vivo || {}) } });
});

app.put('/api/v1/media', async (req, res) => {
  const b = req.body || {};
  if (b.port_min && b.port_max && +b.port_min >= +b.port_max) {
    return res.status(400).json({ error: 'el puerto RTP minimo tiene que ser menor que el maximo' });
  }
  try {
    await db.pool.query(
      'UPDATE sbc_media SET port_min=COALESCE($1,port_min), port_max=COALESCE($2,port_max), timeout=COALESCE($3,timeout), ' +
      'silent_timeout=COALESCE($4,silent_timeout), loglevel=COALESCE($5,loglevel), transcoding=COALESCE($6,transcoding), dtls=COALESCE($7,dtls) WHERE id=1',
      [b.port_min || null, b.port_max || null, b.timeout || null, b.silent_timeout || null, b.loglevel || null,
       b.transcoding === undefined ? null : !!b.transcoding, b.dtls === undefined ? null : !!b.dtls]);
    res.json({ ok: true, pendiente: 'reiniciar el motor de medios para que tome los cambios' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/media/apply', async (req, res) => {
  try {
    const m = await db.one('SELECT * FROM sbc_media WHERE id=1');
    cfgen.media(m);
    const r = await motores.reiniciar('rtpengine');
    await db.pool.query('UPDATE sbc_media SET aplicado_at=now() WHERE id=1');
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════ TURN / STUN: coturn ════════════════════════════════════════ */

app.get('/api/v1/turn', async (req, res) => {
  const t = await db.one('SELECT * FROM sbc_turn WHERE id=1');
  if (t) delete t.secreto;
  const estado = await motores.estado('coturn').catch(() => ({ corriendo: false }));
  res.json({ cfg: t, motor: estado });
});

app.put('/api/v1/turn', async (req, res) => {
  const b = req.body || {};
  try {
    await db.pool.query(
      'UPDATE sbc_turn SET habilitado=COALESCE($1,habilitado), realm=COALESCE($2,realm), usuario=COALESCE($3,usuario), ' +
      'secreto=COALESCE($4,secreto), external_ip=COALESCE($5,external_ip), port_min=COALESCE($6,port_min), ' +
      'port_max=COALESCE($7,port_max), tls=COALESCE($8,tls), stun_solo=COALESCE($9,stun_solo), ' +
      'ip_modo=COALESCE($10,ip_modo), ip_fqdn=COALESCE($11,ip_fqdn), extra=COALESCE($12,extra) WHERE id=1',
      [b.habilitado === undefined ? null : !!b.habilitado, b.realm || null, b.usuario || null,
       b.secreto || null, b.external_ip || null, b.port_min || null, b.port_max || null,
       b.tls === undefined ? null : !!b.tls, b.stun_solo === undefined ? null : !!b.stun_solo,
       b.ip_modo || null, b.ip_fqdn === undefined ? null : b.ip_fqdn,
       b.extra === undefined ? null : JSON.stringify(b.extra)]);
    // el modo del TURN es el modo global de IP publica: los mantenemos en sincronia
    if (b.ip_modo) {
      await publica.escribirCfg({ modo: b.ip_modo, valor: b.ip_modo === 'fqdn' ? (b.ip_fqdn || '') : (b.external_ip || ''), auto_aplicar: true });
    }
    res.json({ ok: true, pendiente: 'reiniciar el TURN para que tome los cambios' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/turn/apply', async (req, res) => {
  try {
    const t = await db.one('SELECT * FROM sbc_turn WHERE id=1');
    if (t.habilitado && !t.secreto) return res.status(400).json({ error: 'falta la credencial del TURN' });

    // La IP publica ya no se pide a mano: se resuelve segun el modo elegido. En 'auto' se
    // le pregunta a un STUN (para IP dinamica de proveedor); en 'fqdn' se resuelve el
    // nombre; en 'fija' se usa la que cargaron. Un SBC que necesita que alguien teclee la
    // IP cada vez que el ISP la cambia no es un producto.
    let ip = t.external_ip;
    let via = 'fija';
    if (t.habilitado && (t.ip_modo || 'auto') !== 'fija') {
      const r = await publica.descubrir().catch((e) => { throw new Error('no se pudo averiguar la IP publica: ' + e.message); });
      ip = r.ip; via = r.via;
      await db.pool.query('UPDATE sbc_turn SET external_ip=$1 WHERE id=1', [ip]);
      await publica.guardar('ip_actual', ip);
    }
    if (t.habilitado && !ip) return res.status(400).json({ error: 'no hay IP publica (ni resuelta ni cargada a mano)' });

    cfgen.turn({ ...t, external_ip: ip });
    const r = await motores.reiniciar('coturn');
    await db.pool.query('UPDATE sbc_turn SET aplicado_at=now() WHERE id=1');
    res.json({ ok: true, external_ip: ip, via, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════ IP PUBLICA (una sola fuente para todo el borde) ═════════════
 *
 * Descubrir, guardar el modo, y forzar el redescubrimiento. El vigia de abajo hace
 * el resto: si el proveedor cambia la IP, se regenera todo solo.
 */
app.get('/api/v1/public-ip', async (req, res) => {
  try {
    const cfg = await publica.leer();
    let resuelta = null, error = null;
    try { resuelta = (await publica.descubrir()).ip; } catch (e) { error = e.message; }
    res.json({ ...cfg, resuelta, error });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/v1/public-ip', async (req, res) => {
  const b = req.body || {};
  try {
    await publica.escribirCfg({
      modo: b.modo || 'auto',
      valor: b.valor || '',
      auto_aplicar: b.auto_aplicar !== false,
      stun: Array.isArray(b.stun) ? b.stun : undefined,
    });
    // que el modo del TURN acompane al global
    await db.pool.query('UPDATE sbc_turn SET ip_modo=$1, ip_fqdn=$2 WHERE id=1',
      [b.modo || 'auto', b.modo === 'fqdn' ? (b.valor || '') : '']);
    const cfg = await publica.leer();
    let resuelta = null, error = null;
    try { resuelta = (await publica.descubrir()).ip; } catch (e) { error = e.message; }
    res.json({ ...cfg, resuelta, error });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/public-ip/refresh', async (req, res) => {
  try { res.json(await sincronizarPublica(true)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════ REGLAS SIP ═════════════════════════════════════════════════ */

app.get('/api/v1/sip-rules', async (req, res) => {
  res.json(await db.get('SELECT * FROM sbc_sip_rules WHERE tenant_id=$1 ORDER BY sentido, orden, id', [tenant(req)]));
});

app.post('/api/v1/sip-rules', async (req, res) => {
  const b = req.body || {};
  const ACCIONES = ['quitar_header', 'agregar_header', 'modificar_header', 'set_from_user', 'set_pai', 'set_ppi', 'set_diversion'];
  if (!ACCIONES.includes(b.accion)) return res.status(400).json({ error: 'accion no valida' });
  try {
    const row = await db.one(
      'INSERT INTO sbc_sip_rules (tenant_id, sentido, destino, accion, header, patron, valor, orden, habilitada, notas) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [tenant(req), b.sentido || 'saliente', b.destino || 'todos', b.accion, b.header || null,
       b.patron || null, b.valor || null, b.orden || 100, b.habilitada !== false, b.notas || null]);
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/v1/sip-rules/:id', async (req, res) => {
  await db.pool.query('DELETE FROM sbc_sip_rules WHERE id=$1 AND tenant_id=$2', [req.params.id, tenant(req)]);
  res.json({ ok: true });
});

app.post('/api/v1/sip-rules/apply', async (req, res) => {
  try {
    const rs = await db.get('SELECT * FROM sbc_sip_rules WHERE tenant_id=$1 ORDER BY sentido, orden, id', [tenant(req)]);
    const archivo = cfgen.reglasSip(rs);
    const r = await motores.reiniciar('kamailio');
    res.json({ ok: true, archivo, reglas: rs.filter((x) => x.habilitada).length, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ═══════════════ REGLAS RECOMENDADAS (packs de compatibilidad) ═══════════════
 *
 * Un SBC profesional se para entre centrales de marcas distintas, y cada marca tiene
 * sus manias. Estos packs son las reglas que uno termina escribiendo SIEMPRE, la
 * primera semana, despues de que el operador rechaza una llamada por una cabecera que
 * ni sabiamos que ibamos mandando.
 *
 * No se aplican solos: se agregan a la lista para que el tecnico las revise, las
 * ordene y despues toque Aplicar. Un pack que se autoaplica es una bomba.
 */
const PACKS = {
  interoperabilidad: {
    nombre: 'Interoperabilidad entre centrales (recomendado)',
    detalle: 'Saca las cabeceras propietarias que cada marca cuela y que la otra punta no entiende. Es lo primero que hace cualquier SBC serio.',
    reglas: [
      { sentido: 'saliente', accion: 'quitar_header', header: 'X-AST-Orig-Host', orden: 10, notas: 'Asterisk / FreePBX: filtra la IP interna de la central' },
      { sentido: 'saliente', accion: 'quitar_header', header: 'P-hint', orden: 11, notas: 'Asterisk: pista de ruteo interna, no le sirve a nadie afuera' },
      { sentido: 'saliente', accion: 'quitar_header', header: 'Alert-Info', orden: 12, notas: 'Timbres propietarios (Grandstream, Yealink): confunden a otras marcas' },
      { sentido: 'saliente', accion: 'quitar_header', header: 'X-3CX-Recording', orden: 13, notas: '3CX: cabecera interna de grabacion' },
      { sentido: 'saliente', accion: 'quitar_header', header: 'Remote-Party-ID', orden: 14, notas: 'RPI (Cisco viejo, obsoleto): el estandar hoy es P-Asserted-Identity (RFC 3325)' },
      { sentido: 'saliente', accion: 'quitar_header', header: 'X-Avaya-Info', orden: 15, notas: 'Avaya: metadatos internos' },
      { sentido: 'entrante', accion: 'quitar_header', header: 'Remote-Party-ID', orden: 10, notas: 'Que la central no vea un RPI que quizas interprete distinto' },
      { sentido: 'entrante', accion: 'quitar_header', header: 'Server', orden: 11, notas: 'No contarle a la central que motor tiene enfrente' },
    ],
  },

  operador_uy: {
    nombre: 'Operador uruguayo (E.164 + PAI)',
    detalle: 'Numeracion tipica de Uruguay: la central marca con 0 y el operador quiere +598. Ajusta el codigo de pais si no es Uruguay.',
    reglas: [
      { sentido: 'saliente', accion: 'strip', valor: '1', orden: 20, notas: 'Sacar el 0 de salida que agrega la central' },
      { sentido: 'saliente', accion: 'e164', valor: '+598', orden: 21, notas: 'Dejar el numero llamado en E.164 (+598...)' },
      { sentido: 'saliente', accion: 'set_pai', valor: '$fU', orden: 22, notas: 'El operador identifica al que llama por el P-Asserted-Identity (RFC 3325)' },
      { sentido: 'entrante', accion: 'quitar_prefijo', patron: '+598', orden: 20, notas: 'La central no entiende +598: se lo sacamos al entrar' },
    ],
  },

  antifraude: {
    nombre: 'Higiene de salida (anti-fraude)',
    detalle: 'Evita que una central comprometida saque llamadas con identidades que no son suyas.',
    reglas: [
      { sentido: 'saliente', accion: 'quitar_header', header: 'Diversion', orden: 30, notas: 'Muchos operadores rechazan la llamada si ven un Diversion que no esperan (RFC 5806)' },
      { sentido: 'saliente', accion: 'quitar_header', header: 'P-Preferred-Identity', orden: 31, notas: 'La identidad la afirma el SBC, no la central: se manda PAI y nada mas' },
    ],
  },
};

app.get('/api/v1/sip-rules/packs', (req, res) => {
  res.json(Object.entries(PACKS).map(([id, p]) => ({
    id, nombre: p.nombre, detalle: p.detalle, reglas: p.reglas.length,
  })));
});

app.post('/api/v1/sip-rules/packs/:id', async (req, res) => {
  const pack = PACKS[req.params.id];
  if (!pack) return res.status(404).json({ error: 'no existe ese pack' });
  try {
    let n = 0;
    for (const r of pack.reglas) {
      // Idempotente: si ya existe una regla igual, no se duplica.
      const ya = await db.one(
        'SELECT id FROM sbc_sip_rules WHERE tenant_id=$1 AND sentido=$2 AND accion=$3 AND coalesce(header,$4)=$4 AND coalesce(valor,$5)=$5',
        [tenant(req), r.sentido, r.accion, r.header || '', r.valor || '']);
      if (ya) continue;
      await db.pool.query(
        'INSERT INTO sbc_sip_rules (tenant_id, sentido, destino, accion, header, patron, valor, orden, habilitada, notas) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [tenant(req), r.sentido, 'todos', r.accion, r.header || null, r.patron || null,
         r.valor || null, r.orden || 100, true, r.notas || null]);
      n++;
    }
    res.json({ ok: true, agregadas: n, total: pack.reglas.length,
      pendiente: 'revisalas y toca Aplicar: no se activan solas' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════ TRANSCODING EN VIVO ═════════════════════════════════════════
 *
 * rtpengine no dice "estoy transcodificando" en un contador: hay que preguntarle por
 * las sesiones y mirar los codecs de cada punta. Si no coinciden, esa llamada se esta
 * traduciendo — y eso cuesta CPU, que es lo que uno quiere saber antes de que el
 * equipo se ponga de rodillas un martes a las 11.
 */
/* rtpengine sabe de CODECS pero no de NÚMEROS: sus "tags" son tags SIP, no el From/To.
 * El origen y destino de la llamada los tiene la captura SIP (sbc_sip_capture), indexada
 * por el mismo Call-ID. Los cruzamos acá para que la pantalla muestre "2001 → 099…". */
const usuarioDeUri = (u) => {
  if (!u) return null;
  const m = String(u).match(/sips?:([^@>;\s]+)/i);
  return m ? m[1] : null;
};
async function numerosDeLlamada(callId) {
  if (!callId) return {};
  try {
    const r = await db.one(
      `SELECT from_uri, to_uri FROM sbc_sip_capture
        WHERE callid=$1 AND method='INVITE' ORDER BY id ASC LIMIT 1`, [callId]);
    if (!r) return {};
    return { origen: usuarioDeUri(r.from_uri), destino: usuarioDeUri(r.to_uri) };
  } catch (_) { return {}; }
}

/* Estado en vivo de cada nodo (central/troncal/gateway): estado, latencia, MOS y
 * cuándo fue el último OPTIONS OK. Lo consumen troncales, centrales y topología. */
app.get('/api/v1/monitor', (req, res) => {
  const m = monitor.estado();
  res.json({ ts: m.ts, nodos: m.nodos });
});

app.get('/api/v1/media/live', async (req, res) => {
  try {
    const est = await rtp.estadisticas().catch(() => ({}));
    let sesiones = await rtp.sesiones().catch(() => []);
    // enriquecer con origen/destino desde la captura SIP
    sesiones = await Promise.all(sesiones.map(async (s) => ({ ...s, ...(await numerosDeLlamada(s.call_id)) })));
    const transcodificando = sesiones.filter((s) => s.transcodifica);
    res.json({
      motor: { ok: !!est, ...est },
      sesiones,
      total: sesiones.length,
      transcodificando: transcodificando.length,
      // Regla practica: cada sesion transcodificada come CPU de verdad. Con 30+ en un
      // equipo modesto ya conviene mirar el load antes de que se note en el audio.
      alerta: transcodificando.length >= 30,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════ SEGURIDAD (parametros del borde) ═══════════════════════════ */

app.get('/api/v1/security/settings', async (req, res) => {
  res.json(await db.one('SELECT * FROM sbc_sec WHERE id=1'));
});

app.put('/api/v1/security/settings', async (req, res) => {
  const b = req.body || {};
  try {
    await db.pool.query(
      'UPDATE sbc_sec SET pike_req=COALESCE($1,pike_req), pike_seg=COALESCE($2,pike_seg), ban_seg=COALESCE($3,ban_seg), ' +
      'auth_fallidos=COALESCE($4,auth_fallidos), secfilter=COALESCE($5,secfilter), geo_bloqueo=COALESCE($6,geo_bloqueo), solo_tls=COALESCE($7,solo_tls) WHERE id=1',
      [b.pike_req || null, b.pike_seg || null, b.ban_seg || null, b.auth_fallidos || null,
       b.secfilter === undefined ? null : !!b.secfilter, b.geo_bloqueo || null,
       b.solo_tls === undefined ? null : !!b.solo_tls]);
    res.json({ ok: true, pendiente: 'aplicar para que el borde tome los nuevos umbrales' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/security/apply', async (req, res) => {
  try {
    const s = await db.one('SELECT * FROM sbc_sec WHERE id=1');
    cfgen.seguridad(s);
    const r = await motores.reiniciar('kamailio');
    await db.pool.query('UPDATE sbc_sec SET aplicado_at=now() WHERE id=1');
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════ MOTORES ════════════════════════════════════════════════════ */

app.get('/api/v1/engines', async (req, res) => {
  const hay = await motores.disponible();
  if (!hay) return res.json({ docker: false, motores: [] });
  const lista = await Promise.all(Object.keys(motores.MOTORES).map((m) => motores.estado(m).catch(() => ({ motor: m, corriendo: false }))));
  res.json({ docker: true, motores: lista });
});

app.post('/api/v1/engines/:motor/restart', async (req, res) => {
  try { res.json(await motores.reiniciar(req.params.motor)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});


/* ═══════════════ RUTAS ESTATICAS ════════════════════════════════════════════
 *
 * No todo lo que el SBC tiene que alcanzar esta en internet: un operador puede
 * entregar el SIP por un enlace dedicado, o una central puede vivir detras de otro
 * router de la LAN. Sin ruta estatica, esos paquetes salen por la WAN y no vuelven
 * — y el sintoma es el peor de todos: "registra pero no entra el audio".
 *
 * Cada fila es un `ip route` y se aplica junto con el modo de red.
 */

const CIDR = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;
const IP = /^\d{1,3}(\.\d{1,3}){3}$/;

app.get('/api/v1/network/routes', async (req, res) => {
  res.json(await db.get('SELECT * FROM sbc_net_routes WHERE tenant_id=$1 ORDER BY metrica, id', [tenant(req)]));
});

app.post('/api/v1/network/routes', async (req, res) => {
  const b = req.body || {};
  if (!CIDR.test(String(b.destino || ''))) return res.status(400).json({ error: 'el destino tiene que ser una red en CIDR (10.20.0.0/16)' });
  if (b.gateway && !IP.test(String(b.gateway))) return res.status(400).json({ error: 'el gateway tiene que ser una IP' });
  if (!b.gateway && !b.iface) return res.status(400).json({ error: 'hace falta un gateway o una placa de salida' });
  try {
    const row = await db.one(
      'INSERT INTO sbc_net_routes (tenant_id, destino, gateway, iface, metrica, notas, habilitada) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [tenant(req), b.destino, b.gateway || null, b.iface || null, b.metrica || 100, b.notas || null, b.habilitada !== false]);
    res.status(201).json(row);
  } catch (e) {
    if (/duplicate|unique/i.test(e.message)) return res.status(409).json({ error: 'ya existe esa ruta' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/v1/network/routes/:id', async (req, res) => {
  const r = await db.one('SELECT * FROM sbc_net_routes WHERE id=$1 AND tenant_id=$2', [req.params.id, tenant(req)]);
  if (r) {
    // Sacarla de la tabla del kernel tambien; si no, sigue viva hasta el proximo reinicio.
    await netmode.borrarRuta(r).catch(() => {});
    await db.pool.query('DELETE FROM sbc_net_routes WHERE id=$1', [req.params.id]);
  }
  res.json({ ok: true });
});


/* ═══════════════ MOTOR SIP: modulos de Kamailio ═════════════════════════════
 *
 * Kamailio tiene ~200 modulos. Acá se ofrece una lista CURADA —los que un SBC de
 * verdad usa— con sus parametros. Y sobre todo: con red de contencion.
 *
 * Aplicar un modulo mal puesto no rompe una pantalla: deja el borde SIN ARRANCAR, o
 * sea sin telefonia. Por eso el flujo es:
 *
 *   1. se genera el fragmento nuevo (y se guarda el anterior)
 *   2. se VALIDA en un contenedor efimero (kamailio -c) — si no valida, se aborta y
 *      no se toco nada
 *   3. se reinicia el motor
 *   4. se espera a que conteste el RPC. Si en 15 s no volvio, se restaura el
 *      fragmento anterior y se reinicia de nuevo: ROLLBACK automatico.
 *
 * Un panel que puede dejarte sin llamadas y no tiene marcha atras no es un panel: es
 * una ruleta.
 */
const kamods = require('./kamods');
const fsp = require('fs');

app.get('/api/v1/engine/modules', async (req, res) => {
  const filas = await db.get('SELECT * FROM sbc_kam_modules');
  const guardado = Object.fromEntries(filas.map((f) => [f.id, f]));
  res.json(kamods.MODULOS.map((m) => {
    const g = guardado[m.id] || {};
    return {
      ...m,
      habilitado: m.nucleo ? true : !!g.habilitado,
      params: (m.params || []).map((p) => ({
        ...p,
        valor: (g.params && g.params[p.k] !== undefined) ? g.params[p.k] : p.def,
      })),
    };
  }));
});

app.put('/api/v1/engine/modules', async (req, res) => {
  const mods = (req.body && req.body.modulos) || [];
  try {
    for (const m of mods) {
      if (!kamods.porId[m.id]) continue;
      if (kamods.esNucleo(m.id) && m.habilitado === false) {
        return res.status(400).json({ error: `${m.id} es del nucleo: apagarlo es apagar el SBC` });
      }
      await db.pool.query(
        'INSERT INTO sbc_kam_modules (id, habilitado, params, updated_at) VALUES ($1,$2,$3, now()) ' +
        'ON CONFLICT (id) DO UPDATE SET habilitado=EXCLUDED.habilitado, params=EXCLUDED.params, updated_at=now()',
        [m.id, !!m.habilitado, JSON.stringify(m.params || {})]);
    }
    res.json({ ok: true, pendiente: 'aplicar para que el motor los tome' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/engine/apply', async (req, res) => {
  const ruta = require('path').join(cfgen.DIR, 'modulos.cfg');
  let previo = null;
  try { previo = fsp.readFileSync(ruta, 'utf8'); } catch (_) {}

  try {
    const filas = await db.get('SELECT * FROM sbc_kam_modules');
    cfgen.modulos(kamods.generar(filas));

    // 1) validar SIN tocar el motor que esta atendiendo
    const v = await motores.validarKamailio();
    if (!v.ok) {
      if (previo !== null) fsp.writeFileSync(ruta, previo); else { try { fsp.unlinkSync(ruta); } catch (_) {} }
      return res.status(400).json({
        error: 'la configuracion no valida: no se toco nada',
        detalle: v.salida,
      });
    }

    // 2) aplicar y 3) esperar a que vuelva
    await motores.reiniciar('kamailio');
    const vivo = await motores.esperarVivo(15);

    if (!vivo) {
      // 4) ROLLBACK: la config valido pero el motor no levanto (una tabla que falta,
      //    un puerto ocupado, lo que sea). Volvemos atras solos.
      if (previo !== null) fsp.writeFileSync(ruta, previo); else { try { fsp.unlinkSync(ruta); } catch (_) {} }
      await motores.reiniciar('kamailio').catch(() => {});
      const revivio = await motores.esperarVivo(20);
      await db.pool.query("INSERT INTO sbc_events (tenant_id, kind, severity, detail) VALUES (1,'motor','crit',$1)",
        [JSON.stringify({ rollback: true, revivio })]);
      return res.status(500).json({
        error: 'el motor no levanto con esa configuracion: se volvio a la anterior',
        rollback: true, recuperado: revivio,
      });
    }

    await db.pool.query("INSERT INTO sbc_events (tenant_id, kind, severity, detail) VALUES (1,'motor','info',$1)",
      [JSON.stringify({ modulos: filas.filter((f) => f.habilitado).map((f) => f.id) })]);
    res.json({ ok: true, validado: true });
  } catch (e) {
    if (previo !== null) { try { fsp.writeFileSync(ruta, previo); } catch (_) {} }
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────── STIR/SHAKEN (secsipid) ─────────────── */
// Generar un par de claves EC (P-256, ES256) + certificado autofirmado. Guarda la clave
// privada (para firmar) y el certificado (para publicar en x5u). Con esto el operador no
// necesita saber de openssl: aprieta un boton y ya puede firmar.
app.post('/api/v1/stir/genkey', async (req, res) => {
  const { execFileSync } = require('child_process');
  const os = require('os'); const _f = require('fs'); const _p = require('path');
  const dir = _f.mkdtempSync(_p.join(os.tmpdir(), 'stir-'));
  const kf = _p.join(dir, 'key.pem'); const cf = _p.join(dir, 'cert.pem');
  try {
    execFileSync('openssl', ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', kf]);
    execFileSync('openssl', ['req', '-new', '-x509', '-key', kf, '-out', cf, '-days', '3650', '-subj', '/CN=SBC-NG STIR/O=SBC-NG']);
    const key = _f.readFileSync(kf, 'utf8'); const cert = _f.readFileSync(cf, 'utf8');
    const fp = execFileSync('openssl', ['x509', '-in', cf, '-noout', '-fingerprint', '-sha256']).toString().trim();
    await db.pool.query('UPDATE sbc_stir SET key_pem=$1, cert_pem=$2, updated_at=now() WHERE id=1', [key, cert]);
    try { _f.writeFileSync(_p.join(cfgen.DIR, 'stir.key'), key); } catch (_) {}
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'sbc.local';
    res.json({ ok: true, fingerprint: fp, x5u: `https://${host}/backend/api/v1/stir/cert.pem` });
  } catch (e) { res.status(500).json({ error: 'no se pudo generar el par: ' + e.message }); }
  finally { try { _f.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
});

app.get('/api/v1/stir', async (req, res) => {
  try {
    const r = await db.get("SELECT id,verify,sign,attest,x5u,(length(key_pem)>0) AS has_key FROM sbc_stir WHERE id=1");
    res.json((r && r[0]) || { verify: false, sign: false, attest: 'A', x5u: '', has_key: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Guardar + aplicar en un paso, con el mismo blindaje que /engine/apply:
// se valida en un contenedor aparte y, si el motor no levanta, se vuelve atras solo.
app.put('/api/v1/stir', async (req, res) => {
  const b = req.body || {};
  const ruta = require('path').join(cfgen.DIR, 'stir.cfg');
  let previo = null; try { previo = fsp.readFileSync(ruta, 'utf8'); } catch (_) {}
  try {
    await db.pool.query(
      "INSERT INTO sbc_stir (id,verify,sign,attest,x5u,key_pem,updated_at) VALUES (1,$1,$2,$3,$4,COALESCE($5,''),now()) " +
      "ON CONFLICT (id) DO UPDATE SET verify=EXCLUDED.verify, sign=EXCLUDED.sign, attest=EXCLUDED.attest, " +
      "x5u=EXCLUDED.x5u, key_pem=COALESCE($5, sbc_stir.key_pem), updated_at=now()",
      [!!b.verify, !!b.sign, (String(b.attest || 'A').match(/[ABC]/) || ['A'])[0], String(b.x5u || ''),
       (b.key_pem && String(b.key_pem).trim()) ? String(b.key_pem) : null]);

    const row = (await db.get('SELECT * FROM sbc_stir WHERE id=1'))[0];
    cfgen.stir(row);

    const v = await motores.validarKamailio();
    if (!v.ok) {
      if (previo !== null) fsp.writeFileSync(ruta, previo); else { try { fsp.unlinkSync(ruta); } catch (_) {} }
      return res.status(400).json({ error: 'la configuracion STIR no valida: no se toco el motor', detalle: v.salida });
    }
    await motores.reiniciar('kamailio');
    const vivo = await motores.esperarVivo(15);
    if (!vivo) {
      if (previo !== null) fsp.writeFileSync(ruta, previo); else { try { fsp.unlinkSync(ruta); } catch (_) {} }
      await motores.reiniciar('kamailio').catch(() => {});
      const revivio = await motores.esperarVivo(20);
      return res.status(500).json({ error: 'el motor no levanto con esa config STIR: se volvio a la anterior', rollback: true, recuperado: revivio });
    }
    res.json({ ok: true, validado: true, verify: !!row.verify, sign: !!row.sign });
  } catch (e) {
    if (previo !== null) { try { fsp.writeFileSync(ruta, previo); } catch (_) {} }
    res.status(500).json({ error: e.message });
  }
});

// Ver el fragmento que se va a aplicar, sin aplicarlo. Nadie deberia tener que
// adivinar que le vamos a meter al motor.
app.get('/api/v1/engine/preview', async (req, res) => {
  const filas = await db.get('SELECT * FROM sbc_kam_modules');
  res.type('text/plain').send(kamods.generar(filas));
});


/* ═══════════════ CAPTURA SIP (el "SIP debug") ═══════════════════════════════
 *
 * Lo que en un AudioCodes es Troubleshoot -> Packet Capture. Cuando el operador dice
 * "yo no recibi nada", la discusion se termina de una sola manera: mostrando el paquete.
 *
 * El filtro NO lo escribe el usuario: se arma con un host y unos puertos. Un campo de
 * filtro libre en un panel web es una consola remota disfrazada.
 */
const cap = require('./captura');
const sipdbg = require('./sipdebug');

/* ─────────────── SIP debug: el analizador en vivo ───────────────
 *
 * El pcap es para llevarselo a Wireshark. Esto es para MIRAR ahora: cada mensaje
 * SIP que cruza el borde, parseado, agrupado por llamada. La herramienta que
 * termina las discusiones de "yo te mande el INVITE".
 */
app.get('/api/v1/sip/messages', async (req, res) => {
  try { res.json(await sipdbg.mensajes(req.query.limit)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/v1/sip/raw/:id', async (req, res) => {
  try { res.json({ raw: await sipdbg.crudo(req.params.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/v1/sip/state', async (req, res) => {
  try { res.json(await sipdbg.estado()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/sip/toggle', async (req, res) => {
  const on = !!(req.body && req.body.on);
  try {
    await db.pool.query("INSERT INTO sbc_settings (key,value) VALUES ('sip_capture_on',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [on ? '1' : '0']);
    if (on) sipdbg.encender(); else sipdbg.detener();
    res.json(await sipdbg.estado());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/sip/clear', async (req, res) => {
  try { res.json(await sipdbg.limpiar()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/v1/capture', (req, res) => {
  try { res.json(cap.estado()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/capture/start', (req, res) => {
  const b = req.body || {};
  try { res.json(cap.iniciar({ host: b.host, puertos: b.puertos, segundos: b.segundos })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/v1/capture/stop', (req, res) => {
  try { res.json(cap.detener()); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Los mensajes SIP en texto, para leerlos en el panel sin bajar el pcap.
app.get('/api/v1/capture/:nombre/messages', async (req, res) => {
  try { res.json(await cap.mensajes(req.params.nombre, +(req.query.limit || 60))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// El .pcap crudo, para abrirlo en Wireshark.
app.get('/api/v1/capture/:nombre/download', (req, res) => {
  try {
    const p = cap.ruta(req.params.nombre);
    res.setHeader('Content-Type', 'application/vnd.tcpdump.pcap');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.nombre}"`);
    require('fs').createReadStream(p).pipe(res);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/v1/capture/:nombre', (req, res) => {
  try { res.json(cap.borrar(req.params.nombre)); } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ─────────────── eventos (bitácora del borde) ─────────────── */


app.get('/api/v1/events', async (req, res) => {
  const n = Math.min(+(req.query.limit || 100), 500);
  res.json(await db.get(
    'SELECT id, kind, severity, detail, created_at FROM sbc_events WHERE tenant_id=$1 ORDER BY id DESC LIMIT $2',
    [tenant(req), n]));
});

/* ─────────────── topología: el dibujo del borde ─────────────── */

app.get('/api/v1/topology', async (req, res) => {
  try {
    const t = tenant(req);
    const [pbx, trunks, red, st] = await Promise.all([
      db.get('SELECT id, name, sip_uri, enabled FROM sbc_pbx WHERE tenant_id=$1 ORDER BY priority', [t]),
      db.get('SELECT id, name, provider_host, transport, mode, enabled, gateway_ip, gateway_dev, remote_url FROM sbc_trunks WHERE tenant_id=$1 ORDER BY id', [t]),
      Promise.resolve(net.conTasas()),
      kam.version().then((v) => ({ ok: true, version: v })).catch(() => ({ ok: false })),
    ]);
    // El modo de red (router o switch) cambia lo que el SBC HACE con el trafico, asi que
    // el dibujo tiene que decirlo: no es lo mismo estar en el medio que mirar pasar.
    const net_cfg = await db.one('SELECT modo FROM sbc_net WHERE id=1');

    // el estado real de cada nodo lo pone el monitor (sondeos de verdad, cacheados)
    // Llamadas vivas del borde (modulo dialog). Se toleran fallos: si el modulo no
    // esta o el RPC no responde, la topologia igual se dibuja, solo sin el contador.
    const llamadas = await kam.dlgActivas()
      .then((d) => ({ total: (d && (d.ongoing ?? d.all)) || 0, ongoing: (d && d.ongoing) || 0, all: (d && d.all) || 0 }))
      .catch(() => ({ total: 0, ongoing: 0, all: 0 }));
    const mon = monitor.estado();
    const rutas_salida = await db.get("SELECT r.id, r.pattern, r.priority, r.trunk_id, r.name, t.name AS trunk_name FROM sbc_routes r LEFT JOIN sbc_trunks t ON t.id=r.trunk_id WHERE r.tenant_id=$1 AND r.enabled ORDER BY r.priority, r.id", [t]).catch(() => []);
    const posFilas = await db.get('SELECT node_key, x, y FROM sbc_topo_pos WHERE tenant_id=$1', [t]);
    const pos = Object.fromEntries(posFilas.map((r) => [r.node_key, { x: r.x, y: r.y }]));
    const gwIp = (mon.nodos.gw && mon.nodos.gw.ip) || await monitor.gateway().catch(() => null);

    res.json({
      sbc: { ...st, interfaces: red },
      modo: (net_cfg && net_cfg.modo) || 'router',
      centrales: pbx,
      troncales: trunks,
      gateway: gwIp ? { ip: gwIp, estado: mon.nodos.gw || { ok: false } } : null,
      estados: mon.nodos,     // { pbx3:{ok,ms,via}, tr1:{...}, gw:{...} }
      pos,
      mon_ts: mon.ts,
      llamadas,
      rutas_salida,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Guardar la posicion de un nodo (drag & drop). Upsert por (tenant, nodo). */
// --- Manuales: cargar una imagen (pegada/arrastrada desde el panel) ---
app.post('/api/v1/manuales/img/:name', (req, res) => {
  const name = req.params.name;
  if (!IMG_OK.test(name)) return res.status(400).json({ error: 'nombre invalido' });
  const data = (req.body && req.body.data) || '';
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(data);
  if (!m) return res.status(400).json({ error: 'se espera un data URL de imagen' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 15 * 1024 * 1024) return res.status(413).json({ error: 'imagen demasiado grande (max 15MB)' });
  try {
    _fs.mkdirSync(MAN_IMG_DIR, { recursive: true });
    _fs.writeFileSync(_path.join(MAN_IMG_DIR, name), buf);
    res.json({ ok: true, name, bytes: buf.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Manuales: borrar una imagen cargada (para recapturar) ---
app.delete('/api/v1/manuales/img/:name', (req, res) => {
  const name = req.params.name;
  if (!IMG_OK.test(name)) return res.status(400).json({ error: 'nombre invalido' });
  try { _fs.rmSync(_path.join(MAN_IMG_DIR, name), { force: true }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Manuales: que imagenes ya estan cargadas (para pintar el estado en el panel) ---
app.get('/api/v1/manuales/img-list', (req, res) => {
  try {
    const files = _fs.existsSync(MAN_IMG_DIR) ? _fs.readdirSync(MAN_IMG_DIR).filter((f) => IMG_OK.test(f)) : [];
    res.json({ cargadas: files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/v1/topology/pos', async (req, res) => {
  const b = req.body || {};
  if (!b.node_key) return res.status(400).json({ error: 'falta el nodo' });
  try {
    await db.pool.query(
      `INSERT INTO sbc_topo_pos (tenant_id, node_key, x, y) VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, node_key) DO UPDATE SET x=$3, y=$4`,
      [tenant(req), b.node_key, +b.x || 0, +b.y || 0]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Volver al layout automatico: borra las posiciones guardadas.
app.delete('/api/v1/topology/pos', async (req, res) => {
  try { await db.pool.query('DELETE FROM sbc_topo_pos WHERE tenant_id=$1', [tenant(req)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// El gateway de salida: verlo y fijarlo (auto = la ruta por defecto del kernel).
app.get('/api/v1/topology/gateway', async (req, res) => {
  try {
    const modo = await db.one("SELECT value FROM sbc_settings WHERE key='topo_gateway_modo'");
    const ip = await db.one("SELECT value FROM sbc_settings WHERE key='topo_gateway_ip'");
    res.json({ modo: (modo && modo.value) || 'auto', ip: (ip && ip.value) || '', resuelto: await monitor.gateway().catch(() => null) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/v1/topology/gateway', async (req, res) => {
  const b = req.body || {};
  try {
    await db.pool.query("INSERT INTO sbc_settings (key,value) VALUES ('topo_gateway_modo',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [b.modo || 'auto']);
    if (b.modo === 'fija') await db.pool.query("INSERT INTO sbc_settings (key,value) VALUES ('topo_gateway_ip',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [b.ip || '']);
    monitor.barrer().catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────── panel: primer arranque ───────────────
 *
 * Un appliance no debería nacer con una contraseña por defecto: la mitad de los SBC
 * comprometidos del mundo son un admin/admin que nadie cambió. La primera vez, el
 * panel muestra el formulario para crear el administrador y la contraseña la elige
 * el dueño en su navegador — no queda ni en un log. La puerta se cierra sola: apenas
 * existe un usuario, este POST devuelve 409.
 */
app.get("/api/v1/auth/setup", async (req, res) => {
  const n = await db.one("SELECT count(*)::int AS n FROM sbc_users");
  res.json({ necesita: !n || n.n === 0 });
});

app.post("/api/v1/auth/setup", async (req, res) => {
  const n = await db.one("SELECT count(*)::int AS n FROM sbc_users");
  if (n && n.n > 0) return res.status(409).json({ error: "el administrador ya existe" });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "usuario y contrasena son obligatorios" });
  if (String(password).length < 8) return res.status(400).json({ error: "la contrasena debe tener al menos 8 caracteres" });
  const u = await db.one(
    "INSERT INTO sbc_users (username, password, role) VALUES ($1,$2,'admin') RETURNING id, username, role",
    [username, bcrypt.hashSync(String(password), 10)]);
  await db.pool.query("INSERT INTO sbc_events (tenant_id, kind, severity, detail) VALUES (1,'setup','info',$1)",
    [JSON.stringify({ username })]);
  const token = jwt.sign({ id: u.id, username: u.username, role: u.role, tenant_id: 1 },
    await secretoJwt(), { expiresIn: "12h" });
  res.status(201).json({ token, user: { username: u.username, role: u.role } });
});

/* ─────────────── panel: sesión ─────────────── */

app.post('/api/v1/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const u = await db.one('SELECT * FROM sbc_users WHERE username=$1', [username || '']);
  if (!u || !bcrypt.compareSync(password || '', u.password)) {
    return res.status(401).json({ error: 'usuario o contraseña incorrectos' });
  }
  const token = jwt.sign({ id: u.id, username: u.username, role: u.role, tenant_id: 1 },
    await secretoJwt(), { expiresIn: '12h' });
  res.json({ token, user: { username: u.username, role: u.role } });
});

// El panel lo llama en cada carga para saber si la sesión sigue viva.
app.get('/api/v1/auth/me', (req, res) => {
  if (!req.auth || req.auth.tipo !== 'panel') return res.status(401).json({ error: 'sesión de panel requerida' });
  res.json({ user: { username: req.auth.username, role: req.auth.role } });
});

/* ─────────────── arranque ─────────────── */

/* ═══════════════ el vigia de la IP publica ═══════════════════════════════════
 *
 * Cada tantos minutos redescubre la IP publica. Si cambio (el proveedor renovo el
 * DHCP, cayo y volvio el enlace), regenera coturn y rtpengine y los reinicia. Es LO
 * que convierte "anda con IP fija" en "anda con cualquier proveedor". Sin esto, un
 * cambio de IP del ISP deja el audio mudo hasta que alguien se da cuenta y entra a
 * mano — y nadie se da cuenta hasta que un cliente se queja.
 */
async function sincronizarPublica(forzar = false) {
  const cfg = await publica.leer();
  const d = await publica.descubrir();            // tira si no se puede resolver
  const cambio = d.ip !== cfg.actual;
  await publica.guardar('ip_visto', new Date().toISOString());

  if (!cambio && !forzar) return { ip: d.ip, via: d.via, cambio: false, aplicado: false };
  await publica.guardar('ip_actual', d.ip);

  // Si el operador no quiere que se aplique solo, dejamos la IP guardada y avisamos: la
  // deteccion siempre corre, pero la accion puede quedar en manos del que mira el panel.
  if (!cfg.auto_aplicar && !forzar) return { ip: d.ip, via: d.via, cambio: true, aplicado: false };

  const tocados = [];
  // coturn: reinicio barato, no corta llamadas de voz (solo re-aloca TURN).
  const t = await db.one('SELECT * FROM sbc_turn WHERE id=1');
  if (t && t.habilitado) {
    await db.pool.query('UPDATE sbc_turn SET external_ip=$1 WHERE id=1', [d.ip]);
    cfgen.turn({ ...t, external_ip: d.ip });
    await motores.reiniciar('coturn').catch(() => {});
    tocados.push('coturn');
  }
  // rtpengine y kamailio anuncian la IP publica en el SDP/Via: el reinicio corta lo que
  // este en curso, pero con la IP vieja esas llamadas YA estaban con el audio roto. No
  // reiniciarlos seria dejar el problema, no evitarlo.
  process.env.PUBLIC_IP = d.ip;
  await motores.reiniciar('rtpengine').catch(() => {});
  tocados.push('rtpengine');

  console.log('[SBC-NG] IP publica cambio a %s (%s) · regenerado: %s', d.ip, d.via, tocados.join(', '));
  return { ip: d.ip, via: d.via, cambio: true, aplicado: true, motores: tocados };
}

function vigilarPublica() {
  const cada = +(process.env.PUBLIC_IP_CHECK_SEG || 180) * 1000;
  setInterval(() => {
    sincronizarPublica(false).catch((e) => console.warn('[SBC-NG] vigia IP:', e.message));
  }, cada);
}

/* Las migraciones corren SOLAS al arrancar.
 *
 * Un appliance no puede depender de que alguien se acuerde de correr `npm run migrate`
 * despues de actualizar: si falta una tabla, el panel tira 500 y el tecnico sale a buscar
 * un bug que no existe. Son idempotentes (llevan registro de lo aplicado), asi que
 * arrancar dos veces no hace dano. */
function migrar() {
  return new Promise((resolve) => {
    require('child_process').execFile('node', [__dirname + '/migrate.js'], { timeout: 60000 },
      (err, out) => {
        const txt = String(out || '').trim();
        if (txt) console.log(txt);
        if (err) console.error('[SBC-NG] las migraciones fallaron:', err.message);
        resolve();
      });
  });
}

(async () => {
  await db.esperar();
  await migrar();
  await secretoJwt();   // que exista antes de atender el primer login
  sipdbg.iniciar().catch((e) => console.error('[sipdebug]', e.message));
  vigilarPublica();   // el vigia de la IP publica: adapta el borde a IP dinamica del proveedor
  monitor.iniciar();   // sondea cada nodo de la topologia y cachea su estado
  soc.iniciar();       // espeja el ipban de Kamailio a sbc_blocked + geoip (SOC)
  // HTTP server explícito para colgarle socket.io (registro de seguridad en vivo).
  const httpServer = require('http').createServer(app);
  const io = new IOServer(httpServer, { path: '/api/v1/rt', addTrailingSlash: false, serveClient: false, cors: { origin: true }, transports: ['polling', 'websocket'] });
  io.use(async (socket, next) => {
    try {
      const tok = (socket.handshake.auth && socket.handshake.auth.token) || (socket.handshake.query && socket.handshake.query.token) || '';
      // token de API norte o JWT del panel
      let ok = false;
      try { const t = await db.one('SELECT id FROM sbc_api_tokens WHERE token=$1', [tok]); if (t) ok = true; } catch (_) {}
      if (!ok) { jwt.verify(tok, await secretoJwt()); ok = true; }
      return ok ? next() : next(new Error('no autorizado'));
    } catch (_) { return next(new Error('no autorizado')); }
  });
  io.on('connection', (socket) => {
    socket.emit('hist', seglog.recientes());
    const h = (ev) => socket.emit('ev', ev);
    seglog.bus.on('ev', h);
    socket.on('disconnect', () => seglog.bus.off('ev', h));
  });
  httpServer.listen(PORT, '0.0.0.0', () => console.log('[SBC-NG] control-plane escuchando en :%d (con socket.io /rt)', PORT));
})();
