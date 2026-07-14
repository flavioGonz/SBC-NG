'use strict';
/* ============================================================================
 *  SBC-NG · interfaces de red (LAN y WAN)
 *
 *  Un SBC tiene dos patas y las dos importan:
 *
 *    · WAN  → la que da a internet. Es la que anuncia en el SDP y la que recibe
 *             los ataques. Si se cae, el mundo deja de existir.
 *    · LAN  → la que va a la central. Si se cae, entran las llamadas pero no
 *             hay a quién dárselas.
 *
 *  El panel las muestra con un RJ45 verde (enlace arriba) o rojo (cable
 *  desenchufado), porque el 80% de los "no anda nada" es exactamente eso.
 *
 *  Todo sale de /sys y /proc: sin dependencias, sin ejecutar comandos.
 * ==========================================================================*/
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

const SYS = '/sys/class/net';

// Placas de verdad: fuera los bridges de docker, los veth y los pseudo-dispositivos.
const REAL = (n) => !/^(lo|docker|br-|veth|virbr|lxcbr|tap|bonding_masters|dummy)/.test(n);

const leer = (p, def = '') => { try { return fs.readFileSync(p, 'utf8').trim(); } catch (_) { return def; } };
const num = (p) => { const v = leer(p); return v === '' ? null : Number(v); };

// ¿Hay cable? operstate=up y carrier=1. Son cosas distintas: una interfaz puede
// estar administrativamente arriba (up) con el cable desenchufado (carrier=0).
function estado(name) {
  const oper = leer(`${SYS}/${name}/operstate`, 'unknown');
  const carrier = leer(`${SYS}/${name}/carrier`, '');
  if (carrier === '0') return 'sin_cable';       // RJ45 rojo
  if (oper === 'up') return 'conectada';         // RJ45 verde
  if (oper === 'down') return 'apagada';
  return 'desconocida';
}

function direcciones(name) {
  const nis = os.networkInterfaces()[name] || [];
  return nis.filter((a) => a.family === 'IPv4').map((a) => ({ ip: a.address, cidr: a.cidr, mac: a.mac }));
}

// Rol de cada placa: la que tiene la ruta por defecto es la WAN; el resto, LAN.
function conRoles(ifaces) {
  let wan = null;
  try {
    const rutas = fs.readFileSync('/proc/net/route', 'utf8').split('\n').slice(1);
    for (const l of rutas) {
      const p = l.trim().split(/\s+/);
      if (p.length > 2 && p[1] === '00000000') { wan = p[0]; break; }   // destino 0.0.0.0 = default
    }
  } catch (_) {}
  return ifaces.map((i) => ({ ...i, rol: i.name === wan ? 'wan' : 'lan' }));
}

function listar() {
  let nombres = [];
  try { nombres = fs.readdirSync(SYS).filter(REAL).sort(); } catch (_) {}

  const ifaces = nombres.map((name) => {
    const rx = num(`${SYS}/${name}/statistics/rx_bytes`);
    const tx = num(`${SYS}/${name}/statistics/tx_bytes`);
    return {
      name,
      estado: estado(name),
      mac: leer(`${SYS}/${name}/address`),
      mtu: num(`${SYS}/${name}/mtu`),
      velocidad_mbps: num(`${SYS}/${name}/speed`),   // -1 si no lo reporta (virtual)
      duplex: leer(`${SYS}/${name}/duplex`, null),
      direcciones: direcciones(name),
      rx_bytes: rx,
      tx_bytes: tx,
      rx_errores: num(`${SYS}/${name}/statistics/rx_errors`),
      tx_errores: num(`${SYS}/${name}/statistics/tx_errors`),
      rx_perdidos: num(`${SYS}/${name}/statistics/rx_dropped`),
      tx_perdidos: num(`${SYS}/${name}/statistics/tx_dropped`),
    };
  });

  return conRoles(ifaces);
}

// Tráfico instantáneo: el contador de bytes es acumulado, así que la velocidad
// sale de la diferencia entre dos lecturas. Guardamos la anterior.
const previo = new Map();
function conTasas() {
  const ahora = Date.now();
  return listar().map((i) => {
    const p = previo.get(i.name);
    let rx_bps = null, tx_bps = null;
    if (p && ahora > p.t) {
      const dt = (ahora - p.t) / 1000;
      rx_bps = Math.max(0, Math.round(((i.rx_bytes - p.rx) * 8) / dt));
      tx_bps = Math.max(0, Math.round(((i.tx_bytes - p.tx) * 8) / dt));
    }
    previo.set(i.name, { t: ahora, rx: i.rx_bytes, tx: i.tx_bytes });
    return { ...i, rx_bps, tx_bps };
  });
}

// Rutas de la tabla principal (las que explican por dónde sale cada cosa).
function rutas() {
  return new Promise((resolve) => {
    execFile('ip', ['-4', 'route', 'show'], { timeout: 3000 }, (err, out) => {
      if (err) return resolve([]);
      const rs = String(out).trim().split('\n').filter(Boolean).map((l) => {
        const dev = (l.match(/dev (\S+)/) || [])[1] || null;
        const via = (l.match(/via (\S+)/) || [])[1] || null;
        const destino = l.startsWith('default') ? 'default' : l.split(' ')[0];
        return { destino, via, dev, cruda: l.trim() };
      });
      resolve(rs);
    });
  });
}

module.exports = { listar, conTasas, rutas };
