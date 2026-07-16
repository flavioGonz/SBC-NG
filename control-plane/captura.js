'use strict';
/* SBC-NG · captura SIP (el "SIP debug"). tcpdump al servicio del panel: cuando el
 * operador dice "yo no recibi nada", la discusion se termina mostrando el paquete.
 * El control-plane corre en modo host + NET_RAW: ve el trafico real con IPs de verdad.
 * Freno de mano: 300 s y 50 MB, para que una captura olvidada no llene el disco. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = process.env.CAPTURE_DIR || '/etc/sbcng/capturas';
const MAX_SEG = 300;
const MAX_MB = 50;

let actual = null;

const asegurarDir = () => { fs.mkdirSync(DIR, { recursive: true }); };

function armarFiltro({ host, puertos }) {
  const partes = [];
  const ps = (puertos && puertos.length ? puertos : [5060, 5061, 8088]);
  partes.push('(' + ps.map((p) => 'port ' + parseInt(p, 10)).join(' or ') + ')');
  if (host) {
    if (!/^[0-9a-zA-Z.\-:]+$/.test(host)) throw new Error('el host tiene caracteres raros');
    partes.push('host ' + host);
  }
  return partes.join(' and ');
}

function iniciar({ host, puertos, segundos = 60 }) {
  if (actual && actual.proc) throw new Error('ya hay una captura corriendo');
  asegurarDir();
  const seg = Math.min(Math.max(parseInt(segundos, 10) || 60, 5), MAX_SEG);
  const filtro = armarFiltro({ host, puertos });
  const nombre = 'sip-' + new Date().toISOString().replace(/[:.]/g, '-') + '.pcap';
  const archivo = path.join(DIR, nombre);

  // Sin -G/-C/-W: mezclarlos hace que tcpdump ROTE el archivo en vez de parar. El corte
  // por tiempo lo maneja un timer del control-plane; el de tamano, vigilando el archivo.
  const proc = spawn('tcpdump', ['-i', 'any', '-s', '0', '-n', '-U', '-w', archivo, filtro]);
  actual = { proc, archivo, nombre, inicio: Date.now(), filtro, seg };

  const timerTiempo = setTimeout(() => { try { proc.kill('SIGTERM'); } catch (_) {} }, seg * 1000);
  const timerTam = setInterval(() => {
    try { if (fs.statSync(archivo).size > MAX_MB * 1024 * 1024) proc.kill('SIGTERM'); } catch (_) {}
  }, 2000);
  proc.on('exit', () => {
    clearTimeout(timerTiempo); clearInterval(timerTam);
    if (actual && actual.proc === proc) actual = { ...actual, proc: null, fin: Date.now() };
  });
  return estado();
}

function detener() {
  if (actual && actual.proc) { try { actual.proc.kill('SIGTERM'); } catch (_) {} }
  return estado();
}

function estado() {
  if (!actual) return { corriendo: false, capturas: listar() };
  let bytes = 0;
  try { bytes = fs.statSync(actual.archivo).size; } catch (_) {}
  return {
    corriendo: !!actual.proc,
    archivo: actual.nombre,
    filtro: actual.filtro,
    segundos: actual.seg,
    transcurrido: Math.round((Date.now() - actual.inicio) / 1000),
    bytes,
    capturas: listar(),
  };
}

function listar() {
  asegurarDir();
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.pcap'))
    .map((f) => { const st = fs.statSync(path.join(DIR, f)); return { nombre: f, bytes: st.size, fecha: st.mtime }; })
    .sort((a, b) => b.fecha - a.fecha)
    .slice(0, 20);
}

const ruta = (nombre) => {
  if (!/^[\w.\-]+\.pcap$/.test(nombre)) throw new Error('nombre invalido');
  return path.join(DIR, nombre);
};

function borrar(nombre) { fs.unlinkSync(ruta(nombre)); return { ok: true }; }

function mensajes(nombre, limite = 60) {
  return new Promise((resolve, reject) => {
    const p = spawn('tcpdump', ['-r', ruta(nombre), '-A', '-n', '-q']);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', () => {
      const crudos = out.split(/\n(?=\d{2}:\d{2}:\d{2}\.\d+ )/);
      const msgs = [];
      for (const c of crudos) {
        const m = c.match(/\n(INVITE|REGISTER|OPTIONS|BYE|ACK|CANCEL|SUBSCRIBE|NOTIFY|INFO|REFER|UPDATE|PRACK|MESSAGE|SIP\/2\.0)[^\n]*/);
        if (!m) continue;
        const hora = (c.match(/^(\d{2}:\d{2}:\d{2}\.\d+)/) || [])[1] || '';
        const flechas = (c.match(/IP ([\d.]+)\.(\d+) > ([\d.]+)\.(\d+)/) || []);
        const cuerpo = c.slice(c.indexOf(m[0])).replace(/\r/g, '').trim();
        msgs.push({
          hora,
          origen: flechas[1] ? flechas[1] + ':' + flechas[2] : '',
          destino: flechas[3] ? flechas[3] + ':' + flechas[4] : '',
          inicio: m[0].trim(),
          esRespuesta: m[1] === 'SIP/2.0',
          texto: cuerpo.slice(0, 4000),
        });
      }
      resolve(msgs.slice(-limite));
    });
  });
}

module.exports = { iniciar, detener, estado, listar, borrar, mensajes, ruta, DIR };
