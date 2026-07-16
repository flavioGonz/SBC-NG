'use strict';
/* ============================================================================
 *  SBC-NG · fuente del "registro en vivo" de seguridad.
 *
 *  Sigue el log de Kamailio en tiempo real (docker.sock, follow) y deja pasar
 *  SOLO las líneas que huelen a seguridad: floods del pike, rechazos del
 *  secfilter, bans, 403/407, auth fallida. Las clasifica por severidad y las
 *  publica en un EventEmitter. El server las empuja al panel por socket.io.
 * ==========================================================================*/
const http = require('http');
const { EventEmitter } = require('events');

const SOCK = '/var/run/docker.sock';
const CONT = process.env.KAMAILIO_CONTAINER || (process.env.COMPOSE_PROJECT || 'sbcng') + '-kamailio-1';
const bus = new EventEmitter();
bus.setMaxListeners(0);
const RECIENTES = [];
const MAX = 200;

const REGLAS = [
  { re: /ipban|banned/i,                                    sev: 'crit', tipo: 'ban' },
  { re: /pike|flood|blocklist|too many|rate/i,              sev: 'crit', tipo: 'flood' },
  { re: /secfilter|friendly-scanner|sipvicious|sipcli|sundayddr|scanner|sql/i, sev: 'warn', tipo: 'secfilter' },
  { re: /\b(403|407)\b|forbidden|unauthorized|not allowed/i, sev: 'warn', tipo: 'rechazo' },
  { re: /auth.{0,12}fail|bad password|invalid.{0,6}(user|cred|nonce)/i, sev: 'warn', tipo: 'auth' },
  { re: /toll|fraud|premium|caro/i,                          sev: 'crit', tipo: 'fraude' },
];
const IP = /(?:\d{1,3}\.){3}\d{1,3}/;

function clasificar(l) {
  for (const r of REGLAS) if (r.re.test(l)) return r;
  return null;
}
function emitir(raw) {
  const linea = String(raw).replace(/[\x00-\x08\x0e-\x1f]/g, '').trim();
  if (!linea) return;
  const c = clasificar(linea);
  if (!c) return;
  const m = linea.match(IP);
  const ev = { t: Date.now(), sev: c.sev, tipo: c.tipo, ip: m ? m[0] : null,
               texto: linea.replace(/^\s*\d+\(\d+\)\s*/, '').slice(0, 360) };
  RECIENTES.push(ev); if (RECIENTES.length > MAX) RECIENTES.shift();
  bus.emit('ev', ev);
}

let pend = '';
function conectar() {
  const req = http.request({
    socketPath: SOCK, method: 'GET',
    path: `/containers/${CONT}/logs?follow=1&stdout=1&stderr=1&tail=40`,
  }, (res) => {
    res.setEncoding('latin1');
    res.on('data', (chunk) => {
      pend += chunk; let i;
      while ((i = pend.indexOf('\n')) >= 0) { emitir(pend.slice(0, i)); pend = pend.slice(i + 1); }
    });
    res.on('end', () => setTimeout(conectar, 3000));
  });
  req.on('error', () => setTimeout(conectar, 3000));
  req.end();
}
conectar();

// Latido de prueba desde el propio panel: si no hay ataques, igual se ve "vivo".
module.exports = { bus, recientes: () => RECIENTES.slice(-MAX), emitir };
