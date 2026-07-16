'use strict';
/* ============================================================================
 *  Control de rtpengine por su protocolo "ng" (bencode sobre UDP).
 *
 *  rtpengine no habla JSON ni tiene API REST: habla bencode, el mismo formato que
 *  usa BitTorrent. Por eso acá hay un codificador y un decodificador minúsculos —
 *  no es capricho, es el idioma del motor.
 *
 *  Lo usamos para tres cosas: saber si está vivo, pedirle estadísticas, y —lo más
 *  interesante— preguntarle QUÉ está haciendo ahora mismo con cada llamada, para
 *  poder decir con certeza cuáles se están transcodificando.
 * ==========================================================================*/
const dgram = require('dgram');

const HOST = process.env.RTPENGINE_HOST || '127.0.0.1';
const PORT = +(process.env.RTPENGINE_PORT || 2223);

/* ── bencode ─────────────────────────────────────────────────────────────── */

function bencode(v) {
  if (typeof v === 'number') return 'i' + v + 'e';
  if (typeof v === 'string') return v.length + ':' + v;
  if (Array.isArray(v)) return 'l' + v.map(bencode).join('') + 'e';
  if (v && typeof v === 'object') {
    return 'd' + Object.keys(v).sort().map((k) => bencode(k) + bencode(v[k])).join('') + 'e';
  }
  throw new Error('tipo no soportado en bencode');
}

// El decodificador: devuelve [valor, posición siguiente].
function bdecode(s, i = 0) {
  const c = s[i];
  if (c === 'i') {
    const fin = s.indexOf('e', i);
    return [parseInt(s.slice(i + 1, fin), 10), fin + 1];
  }
  if (c === 'l') {
    const out = []; i++;
    while (s[i] !== 'e') { const [v, n] = bdecode(s, i); out.push(v); i = n; }
    return [out, i + 1];
  }
  if (c === 'd') {
    const out = {}; i++;
    while (s[i] !== 'e') {
      const [k, n1] = bdecode(s, i);
      const [v, n2] = bdecode(s, n1);
      out[k] = v; i = n2;
    }
    return [out, i + 1];
  }
  // string: <largo>:<contenido>
  const sep = s.indexOf(':', i);
  const largo = parseInt(s.slice(i, sep), 10);
  return [s.slice(sep + 1, sep + 1 + largo), sep + 1 + largo];
}

function comando(cmd, extra = {}, ms = 3000) {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    const cookie = Math.random().toString(36).slice(2, 10);
    const msg = Buffer.from(cookie + ' ' + bencode({ command: cmd, ...extra }));
    const t = setTimeout(() => { try { s.close(); } catch (_) {} reject(new Error('rtpengine no respondió')); }, ms);
    s.on('message', (m) => {
      clearTimeout(t); try { s.close(); } catch (_) {}
      const crudo = m.toString().slice(cookie.length + 1);
      try { resolve(bdecode(crudo)[0]); } catch (_) { resolve(crudo); }
    });
    s.on('error', (e) => { clearTimeout(t); try { s.close(); } catch (_) {} reject(e); });
    s.send(msg, PORT, HOST);
  });
}

const ping = () => comando('ping');
const estadisticas = () => comando('statistics');

/* ── qué está haciendo ahora mismo ────────────────────────────────────────
 *
 * rtpengine no tiene un contador que diga "estoy transcodificando N llamadas". Hay
 * que preguntarle la lista de llamadas y, por cada una, qué códec habla cada punta.
 * Si las dos puntas no hablan el mismo códec, esa llamada se está TRADUCIENDO — y
 * eso cuesta CPU de verdad, que es lo que uno quiere ver antes de que el equipo se
 * ponga de rodillas un martes a las 11.
 */
async function sesiones(limite = 60) {
  const lista = await comando('list', { limit: limite }).catch(() => null);
  const ids = (lista && (lista.calls || lista.list)) || [];
  const out = [];

  for (const id of ids.slice(0, limite)) {
    const q = await comando('query', { 'call-id': id }).catch(() => null);
    if (!q || q.result === 'error') continue;

    // Cada "tag" es una punta del diálogo (el que llama y el llamado).
    const tags = Object.values(q.tags || {});
    const puntas = tags.map((t) => {
      const medias = t.medias || [];
      const codecs = [];
      for (const m of medias) {
        for (const p of (m.payloads || [])) {
          // viene como "0/PCMU/8000" — nos quedamos con el nombre
          const nombre = String(p).split('/')[1];
          if (nombre && !codecs.includes(nombre)) codecs.push(nombre);
        }
      }
      return { etiqueta: t.tag || '', codecs };
    }).filter((p) => p.codecs.length);

    // Transcodifica si las dos puntas no comparten ni un códec.
    let transcodifica = null;                    // null = no se pudo determinar
    if (puntas.length >= 2) {
      const [a, b] = puntas;
      transcodifica = !a.codecs.some((c) => b.codecs.includes(c));
    }

    out.push({
      call_id: id,
      creada: q['created'] || null,
      duracion: q['last signal'] && q['created'] ? q['last signal'] - q['created'] : null,
      puntas,
      transcodifica,
      paquetes: (q.totals && q.totals.RTP && q.totals.RTP.packets) || null,
      bytes: (q.totals && q.totals.RTP && q.totals.RTP.bytes) || null,
    });
  }
  return out;
}

module.exports = { comando, ping, estadisticas, sesiones, bdecode };
