'use strict';
/* ============================================================================
 *  SBC-NG · la IP pública. Una sola vez, para todos.
 *
 *  Un SBC vive o muere por esto. La IP pública aparece en el Via, en el
 *  Record-Route, en el Contact, en el SDP, en el external-ip de coturn y en el
 *  advertised-address de rtpengine. Si UNO de esos está mal, el síntoma no es un
 *  error prolijo: es "registra pero no hay audio", o "la llamada se corta a los 30
 *  segundos" — y se pierden tardes enteras.
 *
 *  Por eso acá hay una sola fuente de verdad, y NO se pide a mano:
 *
 *    · AUTO   → se descubre sola, preguntándole a un STUN. Es lo que hay que usar
 *               cuando el proveedor da IP dinámica: el equipo se entera solo.
 *    · FQDN   → un nombre con DDNS. Se resuelve cada vez.
 *    · FIJA   → una IP literal, para el que tiene IP fija y quiere control.
 *
 *  Y un vigía: cada tantos minutos vuelve a mirar. Si el proveedor cambió la IP, la
 *  configuración se regenera sola. Un SBC que necesita que alguien entre a mano cada
 *  vez que el ISP renueva la IP no es un producto: es un rehén.
 * ==========================================================================*/
const dgram = require('dgram');
const dns = require('dns').promises;
const db = require('./db');

const STUN_POR_DEFECTO = [
  'stun.l.google.com:19302',
  'stun1.l.google.com:19302',
  'stun.cloudflare.com:3478',
];

const ES_IP = (s) => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(s || '').trim());

/* ── STUN a mano ────────────────────────────────────────────────────────────
 *
 *  Son 20 bytes de cabecera y una respuesta con la dirección "como me ves vos".
 *  No hace falta una librería para esto, y no queremos una dependencia más en un
 *  appliance que tiene que arrancar sin internet.
 *
 *  RFC 5389: la IP viene XOR-eada con el magic cookie. Es a propósito — así los NAT
 *  que reescriben IPs a lo bruto dentro del payload no la ensucian.
 */
const COOKIE = 0x2112a442;

function pedirStun(servidor, ms = 2500) {
  return new Promise((resolve, reject) => {
    const [host, puerto] = servidor.split(':');
    const sock = dgram.createSocket('udp4');
    const tx = require('crypto').randomBytes(12);

    const msg = Buffer.alloc(20);
    msg.writeUInt16BE(0x0001, 0);          // Binding Request
    msg.writeUInt16BE(0, 2);               // sin atributos
    msg.writeUInt32BE(COOKIE, 4);
    tx.copy(msg, 8);

    const timer = setTimeout(() => { try { sock.close(); } catch (_) {} reject(new Error('el STUN no contestó')); }, ms);

    sock.on('message', (r) => {
      clearTimeout(timer);
      try { sock.close(); } catch (_) {}
      try { resolve(leerXor(r)); } catch (e) { reject(e); }
    });
    sock.on('error', (e) => { clearTimeout(timer); try { sock.close(); } catch (_) {} reject(e); });
    sock.send(msg, +(puerto || 3478), host, (e) => { if (e) { clearTimeout(timer); reject(e); } });
  });
}

function leerXor(r) {
  if (r.length < 20 || r.readUInt16BE(0) !== 0x0101) throw new Error('respuesta STUN rara');
  let i = 20;
  const fin = 20 + r.readUInt16BE(2);
  while (i + 4 <= fin && i + 4 <= r.length) {
    const tipo = r.readUInt16BE(i);
    const largo = r.readUInt16BE(i + 2);
    const val = r.slice(i + 4, i + 4 + largo);

    // 0x0020 XOR-MAPPED-ADDRESS (el bueno). 0x0001 MAPPED-ADDRESS (el viejo, sin xor).
    if ((tipo === 0x0020 || tipo === 0x0001) && val.length >= 8 && val[1] === 0x01) {
      const bytes = val.slice(4, 8);
      if (tipo === 0x0020) {
        const c = Buffer.alloc(4); c.writeUInt32BE(COOKIE, 0);
        for (let k = 0; k < 4; k++) bytes[k] ^= c[k];
      }
      return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
    }
    i += 4 + largo + ((4 - (largo % 4)) % 4);   // los atributos van alineados a 4 bytes
  }
  throw new Error('el STUN no devolvió una dirección');
}

/* Se le pregunta a varios: uno solo puede estar caído, o mentir. Con dos que
 * coincidan alcanza; si el primero contesta, tampoco vamos a hacer una asamblea. */
async function porStun(servidores) {
  const lista = (servidores && servidores.length ? servidores : STUN_POR_DEFECTO);
  const fallos = [];
  for (const s of lista) {
    try {
      const ip = await pedirStun(s);
      if (ES_IP(ip)) return { ip, via: s };
    } catch (e) { fallos.push(`${s}: ${e.message}`); }
  }
  throw new Error('ningún STUN respondió (' + fallos.join(' · ') + ')');
}

/* ── la configuración ──────────────────────────────────────────────────────── */

const CLAVES = ['ip_modo', 'ip_valor', 'ip_actual', 'ip_visto', 'ip_auto_aplicar', 'ip_stun'];

async function leer() {
  const filas = await db.get('SELECT key, value FROM sbc_settings WHERE key = ANY($1)', [CLAVES]);
  const m = Object.fromEntries(filas.map((f) => [f.key, f.value]));
  return {
    modo: m.ip_modo || 'auto',
    valor: m.ip_valor || '',
    actual: m.ip_actual || '',
    visto: m.ip_visto || null,
    auto_aplicar: m.ip_auto_aplicar !== '0',
    stun: (m.ip_stun || STUN_POR_DEFECTO.join(',')).split(',').map((s) => s.trim()).filter(Boolean),
  };
}

async function guardar(clave, valor) {
  await db.pool.query(
    'INSERT INTO sbc_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
    [clave, String(valor == null ? '' : valor)]);
}

async function escribirCfg(cfg, ip) {
  await guardar('ip_modo', cfg.modo);
  await guardar('ip_valor', cfg.valor || '');
  await guardar('ip_auto_aplicar', cfg.auto_aplicar ? '1' : '0');
  if (cfg.stun) await guardar('ip_stun', cfg.stun.join(','));
  if (ip) await guardar('ip_actual', ip);
}

/* Descubrir la IP AHORA, según el modo. No toca nada: sólo mira. */
async function descubrir() {
  const cfg = await leer();

  if (cfg.modo === 'fija') {
    if (!ES_IP(cfg.valor)) throw new Error('la IP fija que está configurada no es una IP válida');
    return { ip: cfg.valor, via: 'fija' };
  }

  if (cfg.modo === 'fqdn') {
    if (!cfg.valor) throw new Error('falta el nombre (FQDN) a resolver');
    const r = await dns.resolve4(cfg.valor).catch(() => []);
    if (!r.length) throw new Error(`no se pudo resolver ${cfg.valor}`);
    return { ip: r[0], via: `DNS ${cfg.valor}` };
  }

  return porStun(cfg.stun);   // auto
}

module.exports = { leer, guardar, escribirCfg, descubrir, porStun, ES_IP, STUN_POR_DEFECTO };
