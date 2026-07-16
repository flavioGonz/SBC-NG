'use strict';
/* ============================================================================
 *  SBC-NG · analizador SIP en vivo  (el "SIP debug", tipo sngrep)
 *
 *  Ojo con no confundirlo con la captura a pcap (captura.js): aquello es para
 *  LLEVARSE el archivo a Wireshark. Esto es para MIRAR, ahora, sin bajar nada:
 *  un sniffer permanente que parsea cada mensaje SIP que cruza el borde, lo deja
 *  en la base, y el panel lo agrupa por llamada y dibuja la escalera del dialogo.
 *
 *  Es la herramienta que termina las discusiones. "Yo te mande el INVITE" — bueno,
 *  aca esta el paquete, con hora, IP y CSeq.
 *
 *  Corre en el netns del host con NET_RAW: ve el trafico real, con las IPs de verdad
 *  (no la NAT de docker). Anillo de MAX_FILAS: se poda solo, nunca llena el disco.
 * ==========================================================================*/
const { spawn } = require('child_process');
const db = require('./db');

const PUERTOS = [5060, 5061, 8088];
const MAX_FILAS = 5000;
const PODA_CADA = 200;

let proc = null;
let buf = '';
let desdePoda = 0;
let vistos = 0;

const filtro = () => '(' + PUERTOS.map((p) => 'port ' + p).join(' or ') + ')';

const RESPUESTA = /^SIP\/2\.0\s+(\d{3})/;

function cab(txt, ...nombres) {
  const re = new RegExp('^(?:' + nombres.join('|') + '):[ \\t]*(.+)$', 'im');
  const m = txt.match(re);
  return m ? m[1].trim().slice(0, 300) : null;
}

/* Un bloque de `tcpdump -A`: la linea del paquete y debajo el payload en ASCII.
 *
 * OJO, esto cuesta una tarde si no se sabe: tcpdump imprime los bytes del encabezado
 * IP/UDP como basura ASCII PEGADA al arranque del SIP, en la misma linea:
 *
 *     E...P.@.@.....cq..cq......IGOPTIONS sip:192.168.99.113 SIP/2.0
 *
 * O sea que la linea NO empieza con el metodo. Buscar con ^ no encuentra nada y el
 * sniffer parece roto cuando en realidad esta viendo todo. Hay que buscar donde
 * ARRANCA el SIP dentro del bloque y cortar ahi. */
function parsear(bloque) {
  const dir = bloque.match(/IP6?\s+([\d.]+)\.(\d+)\s+>\s+([\d.]+)\.(\d+)/);
  if (!dir) return null;

  const txt = bloque.replace(/\r/g, '');
  const pedido = txt.search(/(?:INVITE|ACK|BYE|CANCEL|REGISTER|OPTIONS|SUBSCRIBE|NOTIFY|INFO|REFER|UPDATE|PRACK|MESSAGE|PUBLISH)\s+sips?:/);
  const respuesta = txt.search(/SIP\/2\.0\s+\d{3}\s/);
  const candidatos = [pedido, respuesta].filter((x) => x >= 0);
  if (!candidatos.length) return null;

  const crudo = txt.slice(Math.min(...candidatos)).trim();
  const primera = crudo.split('\n')[0].trim();
  const resp = primera.match(RESPUESTA);

  return {
    src: dir[1] + ':' + dir[2],
    dst: dir[3] + ':' + dir[4],
    method: resp ? null : (primera.split(/\s+/)[0] || null),
    status: resp ? +resp[1] : null,
    ruri: resp ? null : (primera.split(/\s+/)[1] || null),
    callid: cab(crudo, 'Call-ID', 'i'),
    cseq: cab(crudo, 'CSeq'),
    from_uri: cab(crudo, 'From', 'f'),
    to_uri: cab(crudo, 'To', 't'),
    raw: crudo.slice(0, 8000),
  };
}

async function guardar(m) {
  await db.pool.query(
    `INSERT INTO sbc_sip_capture (src,dst,method,status,callid,cseq,from_uri,to_uri,ruri,raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [m.src, m.dst, m.method, m.status, m.callid, m.cseq, m.from_uri, m.to_uri, m.ruri, m.raw]);
  vistos++;
  if (++desdePoda >= PODA_CADA) {
    desdePoda = 0;
    await db.pool.query(
      'DELETE FROM sbc_sip_capture WHERE id <= (SELECT COALESCE(MAX(id),0) - $1 FROM sbc_sip_capture)',
      [MAX_FILAS]);
  }
}

let tVaciar = null;

function digerir(txt) {
  buf += txt;
  if (buf.length > 1e6) buf = buf.slice(-1e6);           // un paquete raro no nos come la RAM
  const partes = buf.split(/\n(?=\d{2}:\d{2}:\d{2}\.\d+ )/);
  buf = partes.pop() || '';
  for (const p of partes) {
    const m = parsear(p);
    if (m) guardar(m).catch(() => {});                   // si la base parpadea, se pierde ESE mensaje, no el sniffer
  }

  // El ultimo bloque no se puede cerrar hasta que llegue el paquete SIGUIENTE (es lo que
  // marca donde termina). Si nos quedamos con eso, el mensaje mas nuevo -justo el que el
  // tecnico esta esperando ver- aparece recien cuando pasa otra llamada. Asi que si el
  // cable se calla un rato, damos por cerrado lo que quedo colgando.
  if (tVaciar) clearTimeout(tVaciar);
  tVaciar = setTimeout(() => {
    if (!buf.trim()) return;
    const m = parsear(buf);
    buf = '';
    if (m) guardar(m).catch(() => {});
  }, 400);
}

function arrancar() {
  if (proc) return;
  proc = spawn('tcpdump', ['-i', 'any', '-n', '-s', '0', '-A', '-l', '-q', filtro()]);
  proc.stdout.on('data', (d) => digerir(String(d)));
  proc.on('error', (e) => { console.error('[sipdebug] tcpdump no arranco:', e.message); proc = null; });
  proc.on('exit', () => {
    const estaba = proc; proc = null; buf = '';
    // Si lo apagamos nosotros no revive. Si se murio solo, lo levantamos: un sniffer
    // que se cae en silencio es peor que no tenerlo, porque uno cree que esta mirando.
    if (estaba && encendidoDeseado) setTimeout(() => { if (encendidoDeseado) arrancar(); }, 3000);
  });
  console.log('[sipdebug] sniffer arriba:', filtro());
}

let encendidoDeseado = true;

function detener() {
  encendidoDeseado = false;
  if (proc) { try { proc.kill('SIGTERM'); } catch (_) {} }
}

function encender() { encendidoDeseado = true; arrancar(); }

/* Al arrancar el control-plane respetamos lo que el operador dejo elegido. */
async function iniciar() {
  try {
    const r = await db.one("SELECT value FROM sbc_settings WHERE key='sip_capture_on'");
    encendidoDeseado = !(r && r.value === '0');
  } catch (_) { encendidoDeseado = true; }
  if (encendidoDeseado) arrancar();
}

async function estado() {
  let total = 0;
  try { const r = await db.one('SELECT count(*)::int n FROM sbc_sip_capture'); total = r ? r.n : 0; } catch (_) {}
  return { on: !!proc, deseado: encendidoDeseado, total, vistos, filtro: filtro() };
}

const mensajes = (limite = 500) => db.get(
  `SELECT id, extract(epoch from ts)*1000 AS t, src, dst, method, status, callid, cseq, from_uri, to_uri, ruri
     FROM (SELECT * FROM sbc_sip_capture ORDER BY id DESC LIMIT $1) q ORDER BY id ASC`,
  [Math.min(Math.max(parseInt(limite, 10) || 500, 1), 2000)]);

const crudo = async (id) => {
  const r = await db.one('SELECT raw FROM sbc_sip_capture WHERE id=$1', [parseInt(id, 10) || 0]);
  return r ? r.raw : '';
};

const limpiar = async () => { await db.pool.query('TRUNCATE sbc_sip_capture'); vistos = 0; return { ok: true }; };

module.exports = { iniciar, encender, detener, estado, mensajes, crudo, limpiar };
