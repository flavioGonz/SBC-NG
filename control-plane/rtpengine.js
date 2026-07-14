'use strict';
/* Control de rtpengine por su protocolo "ng" (bencode sobre UDP).
 * Lo usamos para pedirle estadísticas y para configurar el transcoding. */
const dgram = require('dgram');

const HOST = process.env.RTPENGINE_HOST || '127.0.0.1';
const PORT = +(process.env.RTPENGINE_PORT || 2223);

// bencode mínimo: rtpengine no habla JSON.
function bencode(v) {
  if (typeof v === 'number') return 'i' + v + 'e';
  if (typeof v === 'string') return v.length + ':' + v;
  if (Array.isArray(v)) return 'l' + v.map(bencode).join('') + 'e';
  if (v && typeof v === 'object') {
    return 'd' + Object.keys(v).sort().map(k => bencode(k) + bencode(v[k])).join('') + 'e';
  }
  throw new Error('tipo no soportado en bencode');
}

function comando(cmd, extra = {}, ms = 3000) {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    const cookie = Math.random().toString(36).slice(2, 10);
    const msg = Buffer.from(cookie + ' ' + bencode({ command: cmd, ...extra }));
    const t = setTimeout(() => { try { s.close(); } catch (_) {} reject(new Error('rtpengine no respondió')); }, ms);
    s.on('message', (m) => {
      clearTimeout(t); try { s.close(); } catch (_) {}
      resolve(m.toString().slice(cookie.length + 1));   // respuesta cruda (bencode)
    });
    s.on('error', (e) => { clearTimeout(t); try { s.close(); } catch (_) {} reject(e); });
    s.send(msg, PORT, HOST);
  });
}

const ping = () => comando('ping');
const estadisticas = () => comando('statistics');

module.exports = { comando, ping, estadisticas };
