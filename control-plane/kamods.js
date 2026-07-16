'use strict';
/* ============================================================================
 *  SBC-NG · catálogo de módulos de Kamailio
 *
 *  Kamailio tiene ~200 módulos. Ofrecerlos todos en un panel no es potencia, es una
 *  trampa: la mitad no aplica a un SBC, varios necesitan tablas que no tenemos, y un
 *  `loadmodule` mal puesto no te rompe una pantalla — te deja el borde sin arrancar,
 *  o sea sin llamadas. Así que acá hay una lista CURADA: los que un SBC de verdad usa,
 *  con sus parámetros y con la explicación de qué pasa si los tocás.
 *
 *  Los `nucleo: true` no se pueden apagar desde el panel. No es paternalismo: sin tm
 *  no hay transacciones, sin rr no hay in-dialog, sin dispatcher no hay a dónde mandar
 *  la llamada. Apagarlos es equivalente a apagar el producto.
 * ==========================================================================*/

const MODULOS = [
  /* ── el esqueleto: sin esto no hay SBC ─────────────────────────────────── */
  { id: 'tm', nombre: 'Transacciones (tm)', nucleo: true, grupo: 'Núcleo',
    detalle: 'El motor de transacciones SIP. Todo lo demás se apoya acá.' },
  { id: 'rr', nombre: 'Record-Route (rr)', nucleo: true, grupo: 'Núcleo',
    detalle: 'Hace que el SBC quede en el camino de toda la llamada, no sólo del INVITE.' },
  { id: 'dispatcher', nombre: 'Dispatcher', nucleo: true, grupo: 'Núcleo',
    detalle: 'A qué central le mandamos las entrantes, con failover si una se cae.',
    params: [
      { k: 'ds_ping_interval', tipo: 'int', def: 30, ayuda: 'Cada cuántos segundos le manda un OPTIONS a la central para ver si está viva.' },
      { k: 'ds_probing_threshold', tipo: 'int', def: 3, ayuda: 'Cuántos pings fallados antes de darla por caída.' },
      { k: 'ds_ping_method', tipo: 'str', def: 'OPTIONS', ayuda: 'Con qué método la sondea. OPTIONS es lo estándar.' },
    ] },
  { id: 'permissions', nombre: 'Permisos (address)', nucleo: true, grupo: 'Núcleo',
    detalle: 'La tabla que dice qué IPs son centrales nuestras y pueden sacar llamadas.' },

  /* ── medios ────────────────────────────────────────────────────────────── */
  { id: 'rtpengine', nombre: 'rtpengine', nucleo: true, grupo: 'Medios',
    detalle: 'Ancla el audio en el SBC: arregla el NAT, transcodifica y cifra cuando hace falta.',
    params: [
      { k: 'rtpengine_sock', tipo: 'str', def: 'udp:127.0.0.1:2223', ayuda: 'Dónde escucha el motor de medios. Cambialo sólo si lo moviste.' },
      { k: 'rtpengine_disable_tout', tipo: 'int', def: 60, ayuda: 'Cuántos segundos lo da por muerto si no contesta.' },
    ] },
  { id: 'nathelper', nombre: 'NAT helper', nucleo: true, grupo: 'Medios',
    detalle: 'Detecta al que está detrás de un NAT y le corrige el Contact. Sin esto, media telefonía remota no anda.',
    params: [
      { k: 'natping_interval', tipo: 'int', def: 0, ayuda: 'Keepalives a los clientes NATeados. 0 = apagado (el SBC no los necesita: usa el alias).' },
    ] },

  /* ── WebRTC ────────────────────────────────────────────────────────────── */
  { id: 'websocket', nombre: 'WebSocket (WebRTC)', grupo: 'WebRTC',
    detalle: 'SIP sobre WebSocket: es lo que permite que un softphone del navegador se registre.',
    params: [
      { k: 'keepalive_mechanism', tipo: 'int', def: 1, ayuda: '1 = ping. Mantiene viva la conexión a través de proxies y NAT.' },
      { k: 'keepalive_timeout', tipo: 'int', def: 30, ayuda: 'Segundos sin respuesta antes de cerrar el websocket.' },
    ] },

  /* ── troncales ─────────────────────────────────────────────────────────── */
  { id: 'uac', nombre: 'Registro contra el operador (uac)', grupo: 'Troncales',
    detalle: 'El SBC se registra contra los operadores que piden usuario y clave.',
    params: [
      { k: 'reg_timer_interval', tipo: 'int', def: 90, ayuda: 'Cada cuánto revisa los registros de troncal.' },
      { k: 'reg_retry_interval', tipo: 'int', def: 60, ayuda: 'Si el operador rechazó el registro, cuánto espera para reintentar.' },
      { k: 'reg_random_delay', tipo: 'int', def: 5, ayuda: 'Desparrama los reintentos para no golpear al operador todos juntos.' },
    ] },
  { id: 'drouting', nombre: 'LCR / ruteo por prefijo', grupo: 'Troncales',
    detalle: 'Por qué operador sale cada número, con failover al siguiente si el primero falla.' },
  { id: 'dialog', nombre: 'Diálogos (llamadas vivas)', grupo: 'Troncales',
    detalle: 'Cuenta las llamadas de verdad (no los INVITEs) y mata las zombis. Es lo que hace posible el límite por troncal (CAC).',
    params: [
      { k: 'default_timeout', tipo: 'int', def: 7200, ayuda: 'Una llamada que dure más que esto se considera colgada y se corta. 7200 = 2 h.' },
    ] },
  { id: 'sst', nombre: 'Session Timers (RFC 4028)', grupo: 'Troncales',
    detalle: 'Refresca el diálogo cada tanto. Varios operadores lo exigen y limpia llamadas que quedaron colgadas.',
    params: [
      { k: 'min_se', tipo: 'int', def: 90, ayuda: 'El mínimo que aceptamos negociar, en segundos. Menos de 90 molesta a algunos operadores.' },
      { k: 'reject_to_small', tipo: 'int', def: 0, ayuda: '1 = rechazar al que pida un intervalo menor al mínimo. 0 = negociar.' },
    ] },

  /* ── seguridad ─────────────────────────────────────────────────────────── */
  { id: 'pike', nombre: 'Anti-flood (pike)', nucleo: true, grupo: 'Seguridad',
    detalle: 'Cuenta cuántos mensajes manda cada IP. Los umbrales se editan en Seguridad, no acá.' },
  { id: 'secfilter', nombre: 'Filtro de escáneres', grupo: 'Seguridad',
    detalle: 'Tira los mensajes de sipvicious y compañía por su User-Agent. Se prende y apaga en Seguridad.' },
  { id: 'sanity', nombre: 'Sanidad del mensaje', nucleo: true, grupo: 'Seguridad',
    detalle: 'Descarta SIP malformado antes de que llegue a la central. Es la primera línea, y es gratis.' },
  { id: 'topoh', nombre: 'Ocultar la topología (topoh)', grupo: 'Seguridad',
    detalle: 'Cifra las cabeceras que revelan la red interna (Via, Record-Route, Contact). El otro lado ve el SBC y nada más — es lo que separa un SBC de un simple proxy.',
    params: [
      { k: 'mask_key', tipo: 'str', def: 'sbcng-topoh', ayuda: 'La clave con la que se enmascara. Cambiala en producción.' },
      { k: 'mask_ip', tipo: 'str', def: '10.10.10.10', ayuda: 'La IP falsa que se muestra en lugar de la real.' },
    ] },

  /* ── observabilidad ────────────────────────────────────────────────────── */
  { id: 'acc', nombre: 'CDR propio del SBC', grupo: 'Observabilidad',
    detalle: 'El borde emite su propio registro de llamadas, independiente del de la central.' },
  { id: 'siptrace', nombre: 'Captura SIP (siptrace / HEP)', grupo: 'Observabilidad',
    detalle: 'Manda una copia de cada mensaje SIP a un Homer/HEP. Es LA herramienta para pelearse con un operador: "mirá, esto es lo que te mandé".',
    params: [
      { k: 'duplicate_uri', tipo: 'str', def: 'sip:127.0.0.1:9060', ayuda: 'A dónde se manda la copia (el capturador Homer).' },
      { k: 'hep_mode_on', tipo: 'int', def: 1, ayuda: '1 = formato HEP3, que es lo que Homer entiende.' },
      { k: 'trace_to_database', tipo: 'int', def: 0, ayuda: '0 = no guardar en nuestra base (llena el disco rapidísimo).' },
    ] },
  { id: 'debugger', nombre: 'Depurador de config', grupo: 'Observabilidad',
    detalle: 'Traza línea por línea qué hace la configuración con un mensaje. Prendelo para diagnosticar, apagalo después: es caro.',
    params: [
      { k: 'cfgtrace', tipo: 'int', def: 0, ayuda: '1 = trazar. Con esto prendido el log crece a ojos vista.' },
    ] },
];

const porId = Object.fromEntries(MODULOS.map((m) => [m.id, m]));
const esNucleo = (id) => !!(porId[id] && porId[id].nucleo);

/* Genera el fragmento que Kamailio importa: los loadmodule de lo que NO viene ya
 * cargado en el cfg base, y los modparam de todo lo configurado desde el panel. */
function generar(estado) {
  // estado: [{ id, habilitado, params: {k: v} }]
  const yaEnBase = ['tm', 'rr', 'dispatcher', 'permissions', 'rtpengine', 'nathelper',
    'websocket', 'uac', 'drouting', 'dialog', 'sst', 'pike', 'secfilter', 'sanity', 'acc'];

  const cargas = [];
  const params = [];

  for (const e of estado) {
    const m = porId[e.id];
    if (!m) continue;
    const activo = m.nucleo || e.habilitado;
    if (!activo) continue;

    if (!yaEnBase.includes(m.id)) cargas.push(`loadmodule "${m.id}.so"`);

    for (const p of (m.params || [])) {
      const v = (e.params && e.params[p.k] !== undefined && e.params[p.k] !== null && e.params[p.k] !== '')
        ? e.params[p.k] : p.def;
      if (v === undefined || v === null || v === '') continue;
      params.push(p.tipo === 'int'
        ? `modparam("${m.id}", "${p.k}", ${parseInt(v, 10)})`
        : `modparam("${m.id}", "${p.k}", "${String(v).replace(/"/g, '\\"')}")`);
    }
  }

  return [
    '# ============================================================',
    '#  Módulos · GENERADO POR SBC-NG — no editar a mano',
    `#  ${new Date().toISOString()}`,
    '# ============================================================',
    ...cargas,
    '',
    ...params,
    '',
  ].join('\n');
}

module.exports = { MODULOS, porId, esNucleo, generar };
