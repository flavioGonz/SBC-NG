'use strict';
/* ============================================================================
 *  SBC-NG · modos de red y rutas
 *
 *  ROUTER: el SBC es la frontera. WAN a internet, LAN a la central, NAT y ruteo.
 *  NO hay servidor DHCP y no lo va a haber: un SBC no es el router de la oficina.
 *
 *  SWITCH (bridge): el SBC no enruta; sus placas quedan unidas en capa 2 por un
 *  puente. El puente (br0) es una interfaz mas — con su MAC, su IP y su estado —
 *  y por eso aparece en la lista de interfaces como cualquier otra.
 *
 *  RUTAS ESTATICAS: en los dos modos. No todo lo que hay que alcanzar esta del
 *  otro lado de la ruta por defecto (un operador por enlace dedicado, una central
 *  detras de otro router). Cada ruta es un `ip route` y se aplica con el modo.
 *
 *  Primero se PLANIFICA (los comandos, para leerlos) y recien despues se APLICA.
 * ==========================================================================*/
const { execFile } = require('child_process');
const net = require('./network');

const correr = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 10000 }, (err, out, errout) => {
    if (err) return reject(new Error(`${cmd} ${args.join(' ')} → ${String(errout || err.message).trim()}`));
    resolve(String(out).trim());
  });
});

/* ─────────────── rutas estaticas ─────────────── */

const cmdRuta = (r) => {
  // `replace` en vez de `add`: es idempotente. Con `add`, aplicar dos veces la misma
  // ruta tira "File exists" y el plan entero se cae por algo que ya estaba bien.
  const a = ['route', 'replace', r.destino];
  if (r.gateway) a.push('via', r.gateway);
  if (r.iface) a.push('dev', r.iface);
  a.push('metric', String(r.metrica || 100));
  return a;
};

const pasosRutas = (rutas) => (rutas || [])
  .filter((r) => r.habilitada)
  .map((r) => ({
    desc: `Ruta: ${r.destino} por ${r.gateway || r.iface}${r.notas ? ` (${r.notas})` : ''}`,
    cmd: ['ip', ...cmdRuta(r)],
  }));

async function borrarRuta(r) {
  const a = ['route', 'del', r.destino];
  if (r.gateway) a.push('via', r.gateway);
  if (r.iface) a.push('dev', r.iface);
  return correr('ip', a);
}

/* ─────────────── el plan ─────────────── */

function planRouter(cfg, ifaces) {
  const { wan_if, lan_if, nat, forward } = cfg;
  const pasos = [];

  if (!wan_if || !lan_if) throw new Error('en modo router hay que decir cual es la WAN y cual es la LAN');
  if (wan_if === lan_if) throw new Error('la WAN y la LAN no pueden ser la misma placa');
  const nombres = ifaces.map((i) => i.name);
  for (const n of [wan_if, lan_if]) {
    if (!nombres.includes(n)) throw new Error(`la placa ${n} no existe en este equipo`);
  }
  for (const nm of [wan_if, lan_if]) {
    const pl = ifaces.find((i) => i.name === nm);
    if (pl && pl.deshabilitada) throw new Error(`la placa ${nm} está deshabilitada; habilitala antes de usarla como WAN/LAN`);
  }

  const br = cfg.bridge || 'br0';
  pasos.push({ desc: 'Desarmar el puente si existia (venimos de modo switch)', cmd: ['sh', '-c', `ip link show ${br} >/dev/null 2>&1 && ip link del ${br} || true`] });
  pasos.push({ desc: 'Levantar las dos placas', cmd: ['sh', '-c', `ip link set ${wan_if} up && ip link set ${lan_if} up`] });
  pasos.push({
    desc: forward ? 'Habilitar el ruteo entre placas (ip_forward)' : 'Deshabilitar el ruteo entre placas',
    cmd: ['sysctl', '-w', `net.ipv4.ip_forward=${forward ? 1 : 0}`],
  });

  if (nat) {
    pasos.push({
      desc: `NAT: enmascarar el trafico de ${lan_if} al salir por ${wan_if}`,
      cmd: ['sh', '-c',
        `nft delete table ip sbcng 2>/dev/null; ` +
        `nft add table ip sbcng && ` +
        `nft add chain ip sbcng postrouting '{ type nat hook postrouting priority 100 ; }' && ` +
        `nft add rule ip sbcng postrouting oifname "${wan_if}" masquerade`],
    });
  } else {
    pasos.push({ desc: 'Quitar el NAT', cmd: ['sh', '-c', 'nft delete table ip sbcng 2>/dev/null || true'] });
  }
  return pasos;
}

function planSwitch(cfg, ifaces) {
  const br = cfg.bridge || 'br0';
  // Miembros del puente: las placas marcadas LAN o en modo bridge. El propio puente
  // nunca es miembro de si mismo (parece obvio; con un br0 en la lista, no lo es).
  const miembros = ifaces
    .filter((i) => i.name !== br && !i.deshabilitada && (i.rol === 'lan' || i.modo === 'bridge'))
    .map((i) => i.name);
  if (miembros.length < 2) throw new Error('en modo switch hacen falta al menos dos placas en el puente');

  const pasos = [];
  pasos.push({ desc: 'Sin NAT: en modo switch el SBC no enmascara nada', cmd: ['sh', '-c', 'nft delete table ip sbcng 2>/dev/null || true'] });
  pasos.push({ desc: 'Sin ruteo entre placas: el puente trabaja en capa 2', cmd: ['sysctl', '-w', 'net.ipv4.ip_forward=0'] });
  pasos.push({ desc: `Crear el puente ${br} (es una interfaz mas: tiene MAC, IP y estado)`, cmd: ['sh', '-c', `ip link show ${br} >/dev/null 2>&1 || ip link add name ${br} type bridge`] });
  for (const m of miembros) {
    pasos.push({ desc: `Enchufar ${m} al puente`, cmd: ['sh', '-c', `ip link set ${m} master ${br} && ip link set ${m} up`] });
  }
  pasos.push({ desc: `Levantar ${br}`, cmd: ['ip', 'link', 'set', br, 'up'] });
  return pasos;
}

const pasosDeshabilitar = (ifaces) => (ifaces || [])
  .filter((i) => i.deshabilitada)
  .map((i) => ({ desc: `Bajar la placa ${i.name} (deshabilitada a propósito)`, cmd: ['ip', 'link', 'set', i.name, 'down'] }));

function plan(cfg, ifaces, rutas) {
  const base = cfg.modo === 'switch' ? planSwitch(cfg, ifaces) : planRouter(cfg, ifaces);
  const pasos = [...pasosDeshabilitar(ifaces), ...base, ...pasosRutas(rutas)];
  return pasos.map((p) => ({ ...p, texto: p.cmd[0] === 'sh' ? p.cmd[2] : p.cmd.join(' ') }));
}

/* Aplicarlo de verdad. Ojo: cambiar el modo de red puede dejar al SBC sin la mano que
 * lo alimenta (si te comes la placa por la que estas entrando, se corta la sesion del
 * panel). Por eso va paso a paso, informando cual fallo. */
async function aplicar(cfg) {
  const ifaces = cfg.interfaces || net.listar();
  const pasos = plan(cfg, ifaces, cfg.rutas);
  const hechos = [];
  for (const p of pasos) {
    try {
      await correr(p.cmd[0], p.cmd.slice(1));
      hechos.push({ ...p, ok: true });
    } catch (e) {
      hechos.push({ ...p, ok: false, error: e.message });
      return { ok: false, pasos: hechos, fallo: p.desc };
    }
  }
  return { ok: true, pasos: hechos };
}

module.exports = { plan, aplicar, borrarRuta };
