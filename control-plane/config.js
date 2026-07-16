'use strict';
/* ============================================================================
 *  SBC-NG · generación de configuración de los motores
 *
 *  El panel edita la base; el control-plane traduce eso a lo que cada motor
 *  entiende y lo deja en /etc/sbcng (volumen compartido). Los entrypoints de
 *  rtpengine y coturn leen su archivo al arrancar, y Kamailio importa el
 *  fragmento de reglas. Después se reinicia el motor que corresponda.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');

const DIR = process.env.CONF_DIR || '/etc/sbcng';

const escribir = (archivo, contenido) => {
  fs.mkdirSync(DIR, { recursive: true });
  const destino = path.join(DIR, archivo);
  fs.writeFileSync(destino + '.tmp', contenido);
  fs.renameSync(destino + '.tmp', destino);   // atómico: el motor nunca lee un archivo a medio escribir
  return destino;
};

function media(m) {
  const txt = [
    '# generado por SBC-NG · no editar a mano (el panel lo pisa)',
    `PORT_MIN=${m.port_min || 30000}`,
    `PORT_MAX=${m.port_max || 40000}`,
    `TIMEOUT=${m.timeout || 60}`,
    `SILENT_TIMEOUT=${m.silent_timeout || 3600}`,
    `LOG_LEVEL=${m.loglevel || 6}`,
    // Ojo: NO se escriben TRANSCODING ni DTLS. rtpengine no los lee: el transcoding lo
    // decide cada llamada segun los codecs de las dos puntas (se lo pide Kamailio en los
    // flags), y el SRTP se activa solo cuando una punta es WebRTC. Escribirlos daba la
    // ilusion de que el panel los controlaba.
    '',
  ].join('\n');
  return escribir('rtpengine.env', txt);
}

function turn(t) {
  const txt = [
    '# generado por SBC-NG · no editar a mano',
    `TURN_HABILITADO=${t.habilitado ? 'yes' : 'no'}`,
    `TURN_REALM=${t.realm || ''}`,
    `TURN_USER=${t.usuario || 'sbcng'}`,
    `TURN_PASS=${t.secreto || ''}`,
    `TURN_EXT_IP=${t.external_ip || ''}`,
    `TURN_PORT_MIN=${t.port_min || 49152}`,
    `TURN_PORT_MAX=${t.port_max || 65535}`,
    `TURN_TLS=${t.tls ? 'yes' : 'no'}`,
    `TURN_STUN_SOLO=${t.stun_solo ? 'yes' : 'no'}`,
    // Ajustes finos: pares clave=valor que el entrypoint pega tal cual al turnserver.conf.
    // coturn tiene decenas de opciones; las que un SBC toca de verdad son un punado, y
    // hasta hoy la unica forma de cambiarlas era editar un .env y recrear el contenedor.
    `TURN_EXTRA=${Object.entries(t.extra || {}).map(([k, v]) => k + '=' + v).join(';')}`,
    '',
  ].join('\n');
  return escribir('coturn.env', txt);
}

/* Reglas SIP -> fragmento de Kamailio.
 *
 * Dos familias, y conviene no mezclarlas en la cabeza:
 *
 *  · MANIPULACION DE CABECERAS — lo que cada operador exige a su manera: quitar el
 *    Diversion que rechaza, forzar el From con SU dominio, poner el numero real en el
 *    P-Asserted-Identity (RFC 3325).
 *
 *  · NORMALIZACION DE NUMEROS — el trabajo sucio de la telefonia: la central marca
 *    "0 9x xxx xxx", el operador quiere "+5989xxxxxxx", y el que llama desde afuera
 *    manda "005982..." que la central no entiende. Sin esto, cada alta de troncal
 *    termina en un dialplan lleno de parches.
 */
const linea = (r) => {
  const v = (r.valor || '').replace(/"/g, '\\"');
  const h = (r.header || '').replace(/"/g, '\\"');
  const p = (r.patron || '').replace(/\//g, '\\/');
  const n = parseInt(r.valor, 10) || 0;

  switch (r.accion) {
    /* ── cabeceras ─────────────────────────────────────────────── */
    case 'quitar_header':    return `  remove_hf("${h}");`;
    case 'agregar_header':   return `  append_hf("${h}: ${v}\\r\\n");`;
    case 'modificar_header': return `  subst_hf("${h}", "/${p}/${v}/", "a");`;
    case 'set_from_user':    return `  uac_replace_from("${v}", "");`;
    case 'set_pai':          return `  remove_hf("P-Asserted-Identity"); append_hf("P-Asserted-Identity: <sip:${v}@$fd>\\r\\n");`;
    case 'set_ppi':          return `  remove_hf("P-Preferred-Identity"); append_hf("P-Preferred-Identity: <sip:${v}@$fd>\\r\\n");`;
    case 'set_diversion':    return `  remove_hf("Diversion"); append_hf("Diversion: <sip:${v}@$fd>\\r\\n");`;

    /* ── normalizacion del numero llamado (R-URI) ──────────────── */
    // strip: saca N digitos del principio. El clasico "sacale el 0 de salida".
    case 'strip':            return `  strip(${n});`;
    // prefijo: le pega algo adelante. "0" para adentro, "+598" para afuera.
    case 'prefijo':          return `  prefix("${v}");`;
    // quitar un prefijo concreto SOLO si esta (no rompe los que no lo tienen)
    case 'quitar_prefijo':   return `  if ($rU =~ "^${p}") { strip(${(r.patron || '').length}); }`;
    // E.164: deja el numero como +CC... El operador internacional lo pide asi (RFC 3966).
    case 'e164':             return [
      `  # E.164 con codigo de pais ${v}`,
      `  if ($rU =~ "^00") { strip(2); prefix("+"); }`,        // 00598... -> +598...
      `  else if ($rU =~ "^0") { strip(1); prefix("${v}"); }`, // 09x...   -> +5989x...
      `  else if (!($rU =~ "^\\\\+")) { prefix("${v}"); }`,    // 9x...    -> +5989x...
    ].join('\n');
    // reescritura libre del numero llamado, con regex
    case 'reescribir_ruri':  return `  $rU = $(rU{re.subst,/${p}/${v}/});`;
    // reescritura del numero que llama (el CallerID que ve el otro lado)
    case 'reescribir_from':  return `  $var(fu) = $(fU{re.subst,/${p}/${v}/}); uac_replace_from("$var(fu)", "");`;
    // CallerID fijo: cuando el operador solo acepta un numero de los suyos
    case 'callerid_fijo':    return `  uac_replace_from("${v}", "");`;

    default: return `  # accion desconocida: ${r.accion}`;
  }
};

function reglasSip(reglas) {
  const bloque = (sentido) => {
    const rs = reglas
      .filter((r) => r.habilitada && r.sentido === sentido)
      .sort((a, b) => (a.orden || 100) - (b.orden || 100));
    const cuerpo = rs.map((r) => {
      const cond = r.destino && r.destino !== 'todos'
        ? `  if ($rd == "${r.destino}" || $du =~ "${r.destino}") {\n  ${linea(r)}\n  }`
        : linea(r);
      return `  # [${r.id}] ${r.notas || r.accion}\n${cond}`;
    }).join('\n');
    // OJO: una route de Kamailio NO puede tener el cuerpo vacio ("invalid route
    // statement" y el motor no arranca). Siempre va un return.
    return `route[SBCNG_REGLAS_${sentido.toUpperCase()}] {\n${cuerpo ? cuerpo + '\n' : ''}  return;\n}`;
  };

  const txt = [
    '# ============================================================',
    '#  Reglas SIP · GENERADO POR SBC-NG — no editar a mano',
    `#  ${new Date().toISOString()} · ${reglas.filter((r) => r.habilitada).length} regla(s) activa(s)`,
    '# ============================================================',
    bloque('saliente'),
    '',
    bloque('entrante'),
    '',
  ].join('\n');
  return escribir('reglas.cfg', txt);
}

function seguridad(s) {
  const txt = [
    '# ============================================================',
    '#  Defensa del borde · GENERADO POR SBC-NG — no editar a mano',
    `#  ${new Date().toISOString()}`,
    '# ============================================================',
    '',
    '# pike: cuantos pedidos tolera una IP en una ventana antes de ser un ataque.',
    `modparam("pike", "sampling_time_unit", ${s.pike_seg || 10})`,
    `modparam("pike", "reqs_density_per_unit", ${s.pike_req || 30})`,
    'modparam("pike", "remove_latency", 4)',
    '',
    '# ipban: la lista negra viva. autoexpire = cuanto dura el bloqueo, en segundos.',
    `modparam("htable", "htable", "ipban=>size=8;autoexpire=${s.ban_seg || 3600};")`,
    '',
    s.secfilter
      ? '#!define SBCNG_SECFILTER'
      : '# secfilter apagado: los User-Agent de escaner no se filtran',
    s.solo_tls
      ? '#!define SBCNG_SOLO_TLS'
      : '# TLS no obligatorio: se acepta UDP/TCP en claro',
    '',
  ].join('\n');
  return escribir('seguridad.cfg', txt);
}

/* Modulos del motor: el fragmento lo arma kamods.js, aca solo se escribe. Va en un
 * archivo aparte a proposito: si hay que hacer rollback, se restaura uno solo. */
function modulos(texto) {
  return escribir('modulos.cfg', texto);
}

function stir(s) {
  s = s || {};
  const x5u = String(s.x5u || '').replace(/["\r\n]/g, '').trim();
  const attest = (String(s.attest || 'A').match(/[ABC]/) || ['A'])[0];
  const L = ['# generado por SBC-NG - STIR/SHAKEN (no editar a mano: el panel lo pisa)'];
  if (s.verify) {
    L.push('#!define SBCNG_STIR_VERIFY');
    L.push('route[STIRVERIFY] {');
    L.push('  if (!is_method("INVITE") || has_totag()) return;');
    L.push('  if (!is_present_hf("Identity")) { append_hf("X-STIR-Verstat: No-TN-Validation\\r\\n"); return; }');
    L.push('  if (secsipid_check_identity("")) {');
    L.push('    append_hf("X-STIR-Verstat: TN-Validation-Passed\\r\\n");');
    L.push('  } else {');
    L.push('    append_hf("X-STIR-Verstat: TN-Validation-Failed\\r\\n");');
    L.push('    xlog("L_NOTICE","SBC-NG STIR verify FAIL fu=$fu si=$si\\n");');
    L.push('  }');
    L.push('}');
  }
  if (s.sign && x5u) {
    L.push('#!define SBCNG_STIR_SIGN');
    L.push('route[STIRSIGN] {');
    L.push('  if (!is_method("INVITE") || has_totag()) return;');
    L.push('  secsipid_add_identity("$fU", "$rU", "' + attest + '", "$ci", "' + x5u + '", "/etc/sbcng/stir.key");');
    L.push('}');
  }
  if (!s.verify && !(s.sign && x5u)) L.push('# STIR apagado');
  if (s.sign && s.key_pem) escribir('stir.key', String(s.key_pem));
  return escribir('stir.cfg', L.join('\n') + '\n');
}

module.exports = { media, turn, reglasSip, seguridad, modulos, stir, DIR };
