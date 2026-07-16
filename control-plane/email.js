'use strict';
/* ============================================================================
 *  SBC-NG · correo saliente (SMTP).
 *
 *  El borde tiene cosas para avisar: una IP que empezó a martillar el 5060, una
 *  troncal que se cayó, un pico de transcoding. Todo eso no sirve si nadie lo ve.
 *  Este módulo le da al SBC una salida de correo para mandar esas alertas.
 *
 *  La contraseña NUNCA vuelve por la API: se guarda y, si el PUT la manda vacía, se
 *  deja la que ya estaba (así el panel puede editar el resto sin reescribir la clave).
 * ==========================================================================*/
const nodemailer = require('nodemailer');
const _path = require('path');
// Logo inline por CID: el <img src="cid:sbclogo"> de las plantillas apunta aca.
const LOGO = () => [{ filename: 'sbc-ng.png', path: _path.join(__dirname, 'logo.png'), cid: 'sbclogo' }];
const db = require('./db');
const tpl = require('./emails');

// Catálogo de eventos que el borde puede avisar por correo. El label/desc es para el
// panel; el tema pinta el color del email; severity es el default si el trigger no lo pasa.
const CATALOGO = [
  { evento: 'security.attack', label: 'Ataque en curso',   tema: 'attack',    sev: 'crit', desc: 'Pico de escaneos o fuerza bruta contra el 5060.' },
  { evento: 'security.ban',    label: 'IP bloqueada',       tema: 'security',  sev: 'info', desc: 'El borde bloqueó una IP por abuso (puede ser ruidoso).' },
  { evento: 'service.down',    label: 'Motor caído',        tema: 'infra',     sev: 'crit', desc: 'Un motor del borde (Kamailio, rtpengine…) dejó de responder.' },
  { evento: 'service.up',      label: 'Motor recuperado',   tema: 'recovered', sev: 'info', desc: 'Un motor volvió a responder.' },
  { evento: 'trunk.down',      label: 'Troncal caída',      tema: 'infra',     sev: 'warn', desc: 'Una troncal dejó de responder OPTIONS.' },
  { evento: 'fraud.toll',      label: 'Intento de fraude',  tema: 'fraud',     sev: 'warn', desc: 'Intento de marcar a números caros/PSTN desde afuera.' },
  { evento: 'digest.daily',    label: 'Resumen diario',     tema: 'digest',    sev: 'info', desc: 'Resumen del borde: llamadas, bloqueos, calidad.' },
];
const porEvento = Object.fromEntries(CATALOGO.map((c) => [c.evento, c]));

async function leer() {
  const r = await db.one('SELECT id, host, port, secure, username, from_addr, enabled, ' +
    "(COALESCE(NULLIF(password,''),'') <> '') AS tiene_password FROM sbc_email WHERE id=1");
  return r || { id: 1, port: 587, enabled: false, tiene_password: false };
}

async function guardar(b) {
  await db.pool.query(
    `UPDATE sbc_email SET host=$1, port=$2, secure=$3, username=$4,
       password=COALESCE(NULLIF($5,''), password), from_addr=$6, enabled=$7, updated_at=now()
     WHERE id=1`,
    [b.host || null, b.port || 587, !!b.secure, b.username || null,
     b.password || '', b.from_addr || null, !!b.enabled]);
  return leer();
}

/* Traduce el error crudo del SMTP a algo accionable: el 90% es "contraseña de
 * aplicación" o "el firewall no deja salir al 465/587". */
function pista(e) {
  const m = (e && e.message) || String(e);
  const code = (e && e.code) || '';
  if (code === 'EAUTH' || /534|Application-specific password|Username and Password not accepted|BadCredentials|5\.7\.[89]/i.test(m))
    return 'El servidor rechazó la contraseña. Si es Gmail/Workspace con verificación en 2 pasos, generá una Contraseña de aplicación (myaccount.google.com/apppasswords) y usá esa.';
  if (/ETIMEDOUT|ECONNECTION|ESOCKET|ECONNREFUSED|EHOSTUNREACH|getaddrinfo|ENOTFOUND/i.test(code + ' ' + m))
    return 'No se pudo conectar al servidor SMTP. Revisá host, puerto (465 SSL / 587 STARTTLS) y que el firewall permita la salida.';
  if (code === 'EENVELOPE' || /recipient|sender|5\.1\./i.test(m))
    return 'El remitente o el destinatario fueron rechazados por el servidor.';
  return m;
}

async function transporte() {
  const r = await db.one('SELECT host, port, secure, username, password, from_addr, enabled FROM sbc_email WHERE id=1');
  if (!r || !r.host) throw new Error('todavía no hay servidor SMTP configurado');
  const tx = nodemailer.createTransport({
    host: r.host, port: r.port || 587, secure: !!r.secure,
    auth: r.username ? { user: r.username, pass: r.password } : undefined,
  });
  return { tx, from: r.from_addr || r.username };
}

async function probar(to) {
  const { tx, from } = await transporte();
  await tx.sendMail({ from, to, subject: 'Prueba de correo · SBC-NG', html: tpl.testEmail({}), attachments: LOGO() });
  return { ok: true };
}

/* Para que otros módulos (el SOC) manden una alerta sin saber de SMTP. */
async function enviar(to, subject, text) {
  const cfg = await db.one('SELECT enabled FROM sbc_email WHERE id=1');
  if (!cfg || !cfg.enabled) return { ok: false, motivo: 'correo deshabilitado' };
  const { tx, from } = await transporte();
  await tx.sendMail({ from, to, subject, text });
  return { ok: true };
}

// --- notificaciones: qué eventos avisan y a quién ---------------------------
async function leerNotif() {
  const em = await db.one("SELECT COALESCE(alert_to,'') AS alert_to FROM sbc_email WHERE id=1");
  const filas = await db.get('SELECT evento, habilitado FROM sbc_notif_eventos');
  const estado = Object.fromEntries(filas.map((r) => [r.evento, r.habilitado]));
  return {
    alert_to: (em && em.alert_to) || '',
    eventos: CATALOGO.map((c) => ({ ...c, habilitado: estado[c.evento] !== undefined ? estado[c.evento] : true })),
  };
}
async function guardarNotif(b = {}) {
  if (b.alert_to !== undefined) await db.pool.query('UPDATE sbc_email SET alert_to=$1 WHERE id=1', [String(b.alert_to || '')]);
  for (const e of (b.eventos || [])) {
    if (!porEvento[e.evento]) continue;
    await db.pool.query(
      'INSERT INTO sbc_notif_eventos(evento,habilitado) VALUES($1,$2) ON CONFLICT (evento) DO UPDATE SET habilitado=$2',
      [e.evento, !!e.habilitado]);
  }
  return leerNotif();
}

/* Render de un evento a HTML — lo usa el preview del panel y el test. */
function renderEvento(evento, datos = {}) {
  const c = porEvento[evento] || { label: 'Aviso', sev: 'info' };
  return tpl.alertEmail({
    event: evento, severity: datos.severity || c.sev, title: datos.title || c.label,
    lines: datos.lines || [['Evento', c.label], ['Cuándo', new Date().toLocaleString('es-UY')]],
    foot: datos.foot || c.desc,
  });
}

/* Dispara una alerta por un evento SI está habilitado y hay destinatarios. Lo llaman
   el SOC / el monitor cuando pasa algo. Nunca tira: un aviso que falla no debe tumbar nada. */
async function notificar(evento, datos = {}) {
  try {
    const cfg = await db.one("SELECT enabled, COALESCE(alert_to,'') AS alert_to FROM sbc_email WHERE id=1");
    if (!cfg || !cfg.enabled || !cfg.alert_to) return { ok: false, motivo: 'sin correo o sin destinatarios' };
    const ev = await db.one('SELECT habilitado FROM sbc_notif_eventos WHERE evento=$1', [evento]);
    if (ev && ev.habilitado === false) return { ok: false, motivo: 'evento deshabilitado' };
    const c = porEvento[evento] || { label: 'Aviso' };
    const { tx, from } = await transporte();
    await tx.sendMail({ from, to: cfg.alert_to, subject: `[SBC-NG] ${datos.title || c.label}`, html: renderEvento(evento, datos), attachments: LOGO() });
    return { ok: true };
  } catch (e) { return { ok: false, motivo: e.message }; }
}

/* Manda un ejemplo del template de un evento a un destinatario (ignora el on/off:
   es una prueba). */
async function probarEvento(to, evento) {
  const c = porEvento[evento] || { label: 'Aviso' };
  const { tx, from } = await transporte();
  await tx.sendMail({ from, to, subject: `[SBC-NG] (prueba) ${c.label}`, html: renderEvento(evento, {}), attachments: LOGO() });
  return { ok: true };
}

module.exports = { leer, guardar, probar, enviar, pista, CATALOGO, leerNotif, guardarNotif, notificar, renderEvento, probarEvento };
