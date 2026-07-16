'use strict';
/* ============================================================================
 *  SBC-NG · diagnóstico de red: ping y traceroute.
 *
 *  Cuando algo no anda, la primera pregunta siempre es la misma: "¿desde el SBC se
 *  llega?". Y la respuesta casi nunca la tiene el que está mirando el panel — la
 *  tiene el equipo. Esto la trae sin pedirle a nadie que abra una consola.
 *
 *  El destino se valida contra una lista de caracteres permitidos y se pasa como
 *  ARGUMENTO, nunca por shell. Un campo libre que termina en un `sh -c` no es una
 *  herramienta de diagnóstico: es una consola remota con otro nombre.
 * ==========================================================================*/
const { execFile } = require('child_process');

// Un host o IP y nada más: letras, números, punto, guion y dos puntos (IPv6).
const HOST_OK = /^[A-Za-z0-9][A-Za-z0-9.\-:]{0,253}$/;

function validar(host) {
  const h = String(host || '').trim();
  if (!HOST_OK.test(h)) throw new Error('ese destino no parece un host ni una IP');
  return h;
}

function correr(cmd, args, seg) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    execFile(cmd, args, { timeout: seg * 1000, maxBuffer: 512 * 1024 }, (err, out, errOut) => {
      const texto = String(out || '') + String(errOut || '');
      resolve({
        ok: !err,
        salida: texto.trim() || (err ? err.message : ''),
        ms: Date.now() - t0,
        // `ping` devuelve != 0 cuando no hay respuesta. Eso NO es un fallo del panel:
        // es la respuesta. Por eso la salida vale aunque ok sea false.
        comando: [cmd, ...args].join(' '),
      });
    });
  });
}

/* -c 4: cuatro paquetes alcanzan para saber si llega y con cuánta latencia.
 * -W 2: dos segundos por paquete, para que un destino muerto no cuelgue la pantalla. */
const ping = (host) => correr('ping', ['-c', '4', '-W', '2', '-n', validar(host)], 15);

/* -m 15 saltos: más que eso, en una red de telefonía, ya es otro problema.
 * -w 2 de espera por salto, y UDP por defecto (no necesita privilegios raros). */
const trace = (host) => correr('traceroute', ['-n', '-m', '15', '-w', '2', validar(host)], 40);

module.exports = { ping, trace };
