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

const PORT = +(process.env.PORT || 3100);
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(24).toString('hex');

const app = express();
app.use(express.json({ limit: '2mb' }));

/* ─────────────── auth ─────────────── */

// Público: sólo la salud y el login del panel.
const PUBLICO = [/^\/health$/, /^\/api\/v1\/auth\/login$/];

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
    req.auth = { tipo: 'panel', ...jwt.verify(tok, JWT_SECRET) };
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

/* ─────────────── troncales ─────────────── */

app.get('/api/v1/trunks', async (req, res) => {
  const rows = await db.get('SELECT * FROM sbc_trunks WHERE tenant_id=$1 ORDER BY id', [tenant(req)]);
  res.json(rows.map(({ password, ...t }) => ({ ...t, tiene_password: !!password })));
});

app.post('/api/v1/trunks', async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.provider_host) return res.status(400).json({ error: 'name y provider_host son obligatorios' });
  try {
    const row = await db.one(
      `INSERT INTO sbc_trunks (tenant_id,name,provider_host,provider_port,transport,mode,username,password,realm,
                               from_user,from_domain,codecs,dtmf,session_timers,max_calls,dids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id, name`,
      [tenant(req), b.name, b.provider_host, b.provider_port || 5060, b.transport || 'udp',
       b.mode || 'register', b.username || null, b.password || null, b.realm || null,
       b.from_user || null, b.from_domain || null, b.codecs || 'ulaw,alaw,g729,opus',
       b.dtmf || 'rfc4733', !!b.session_timers, b.max_calls || 0, b.dids || []]);
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────── seguridad ─────────────── */

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

/* ─────────────── registros SIP en vivo ─────────────── */

app.get('/api/v1/registrations', async (req, res) => {
  try { res.json(await kam.registrations()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────── panel: login ─────────────── */

app.post('/api/v1/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const u = await db.one('SELECT * FROM sbc_users WHERE username=$1', [username || '']);
  if (!u || !bcrypt.compareSync(password || '', u.password)) {
    return res.status(401).json({ error: 'usuario o contraseña incorrectos' });
  }
  const token = jwt.sign({ id: u.id, username: u.username, role: u.role, tenant_id: 1 }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { username: u.username, role: u.role } });
});

/* ─────────────── arranque ─────────────── */

(async () => {
  await db.esperar();
  app.listen(PORT, '0.0.0.0', () => console.log('[SBC-NG] control-plane escuchando en :%d', PORT));
})();
