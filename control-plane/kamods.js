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

  /* ── interoperabilidad con operadores (del análisis de módulos) ─────────── */
  { id: 'textopsx', nombre: 'Cabeceras avanzadas (textopsx)', grupo: 'Interoperabilidad',
    detalle: 'Manipulación fina de cabeceras SIP que textops no cubre (append/insert/remove por posición). Se prende y se usa desde las reglas de manipulación.' },
  { id: 'sdpops', nombre: 'Edición de SDP (sdpops)', grupo: 'Interoperabilidad',
    detalle: 'Control de códecs y del cuerpo SDP a nivel config: quitar un códec que el operador rechaza, forzar un orden, limpiar atributos. Complementa al transcoding.' },
  { id: 'uac_redirect', nombre: 'Seguir redirecciones 3xx (uac_redirect)', grupo: 'Interoperabilidad',
    detalle: 'Cuando un operador contesta 301/302, el SBC sigue la nueva ubicacion en vez de fallar. Util con operadores que balancean por redireccion.' },

  /* ── limites de tasa / anti-fraude (del análisis) ──────────────────────── */
  { id: 'ratelimit', nombre: 'Limite de tasa (ratelimit)', grupo: 'Seguridad',
    detalle: 'Limita el ritmo de mensajes por metodo (INVITE/REGISTER) con algoritmos de tasa. Sube el anti-DoS de "flood por IP" (pike) a "policy de tasa configurable".',
    params: [
      { k: 'timer_interval', tipo: 'int', def: 10, ayuda: 'Cada cuantos segundos recalcula la tasa. 10 es un buen punto de partida.' },
    ] },
  { id: 'pipelimit', nombre: 'Colas de tasa por nombre (pipelimit)', grupo: 'Seguridad',
    detalle: 'Como ratelimit pero con "tuberias" nombradas: un tope por troncal o por cliente, no solo global. Se ata a una tuberia en las reglas.' },

  /* ── integración con el panel/app (del análisis) ───────────────────────── */
  { id: 'http_client', nombre: 'Llamadas HTTP desde el ruteo (http_client)', grupo: 'Integración',
    detalle: 'Permite consultar una API (webhook, anti-fraude, decision de ruteo) desde la config de Kamailio. Encaja con "todo configurable desde el panel".',
    params: [
      { k: 'connection_timeout', tipo: 'int', def: 5, ayuda: 'Segundos maximos que espera una consulta HTTP antes de cortar (no colgar la llamada).' },
    ] },
  { id: 'jansson', nombre: 'JSON en la config (jansson)', grupo: 'Integración',
    detalle: 'Arma y parsea JSON dentro del ruteo. Va de la mano de http_client para hablar con APIs modernas.' },

  /* ── traducción de números (del análisis; usa base de datos) ─────────────── */
  { id: 'dialplan', nombre: 'Traducción de números (dialplan)', grupo: 'Interoperabilidad', db: true,
    detalle: 'Reescribe números por tabla (dpid) con expresiones regulares: normalizar a E.164, poner/sacar prefijos, mapear cortos. Las reglas se cargan en Conectividad → Traducción. OJO: para que actúe hay que llamar dp_translate() en el ruteo — se prueba con una llamada real.' },

  /* ── ocultamiento de topología alternativo (del análisis de módulos) ─────── */
  { id: 'topos', nombre: 'Ocultar topología por estado (topos)', grupo: 'Seguridad', db: true,
    detalle: 'Alternativa a topoh: en vez de cifrar las cabeceras, las GUARDA en la base y las quita del mensaje, reponiéndolas cuando la respuesta vuelve por el diálogo. El otro lado no ve NADA de la red interna, ni siquiera un blob cifrado. Útil con operadores a los que el Via enmascarado de topoh les molesta.',
    requiere: 'EXCLUYENTE con topoh: al activarlo, el panel apaga topoh solo. Guarda estado en las tablas topos_d/topos_t (ya migradas).',
    params: [
      { k: 'mask_callid', tipo: 'int', def: 0, ayuda: '1 = también enmascara el Call-ID. Más privacidad, pero complica correlacionar llamadas en el CDR y en la captura.' },
      { k: 'clean_interval', tipo: 'int', def: 60, ayuda: 'Cada cuántos segundos limpia el estado viejo de las tablas.' },
    ] },

  /* ── el SBC como registrar de sus propios endpoints (del análisis) ───────── */
  { id: 'registrar', nombre: 'Registrar propio (registrar)', grupo: 'Interoperabilidad', companions: ['usrloc', 'auth', 'auth_db'],
    detalle: 'Deja que el SBC TERMINE los registros de los teléfonos/softphones en el borde (usrloc) y los autentique por digest contra credenciales locales (auth_db), en vez de reenviarlos a la central. Baja carga de REGISTER en la PBX y sobrevive a que la central se caiga.',
    requiere: 'usrloc + auth + auth_db (se cargan solos) + cuentas SIP del borde y realm (se configuran en /registros). Cambia el modelo de registro: activar con intención.' },

  /* ── señalización cifrada (del análisis; usa el cert de ACME) ────────────── */
  { id: 'tls', nombre: 'SIP sobre TLS nativo (tls)', grupo: 'Seguridad', baseManaged: true,
    detalle: 'Señalización SIP cifrada DIRECTA (SIPS, puerto 5061) contra un operador o teléfono que exija sips:. OJO: el TLS del panel y del WebRTC (WSS) NO pasa por acá — lo termina el NPM proxy con el cert de Let\'s Encrypt y reenvía ws plano al :8088. El módulo tls sólo hace falta para troncales/extensiones SIPS nativas, que hoy no usamos.',
    requiere: 'Sólo si un operador pide SIPS nativo. Se activa en el DESPLIEGUE (listener tls:5061 + enable_tls + tls.cfg). El cert NO se re-emite en Kamailio: se le comparte el mismo que el NPM proxy ya renueva (por volumen). Sin operador que lo exija, dejar apagado.' },

  /* ── geolocalización de IPs en el ruteo (del análisis) ───────────────────── */
  { id: 'geoip2', nombre: 'GeoIP de la IP origen (geoip2)', grupo: 'Seguridad',
    detalle: 'Resuelve el país de la IP que manda cada mensaje DENTRO del ruteo, para bloquear o priorizar por país en el borde (antes de tocar la central). Alimenta el bloqueo por país y la bandera de cada IP en el SOC.',
    params: [
      { k: 'path', tipo: 'str', def: '/etc/sbcng/geoip/country.mmdb', ayuda: 'Ruta a la base de geolocalización (.mmdb). Viene una base de país de db-ip; se puede reemplazar por GeoLite2 de MaxMind.' },
    ] },

  /* ── listas negras dirigidas por base (del análisis) ─────────────────────── */
  { id: 'userblacklist', nombre: 'Listas negras por base (userblacklist)', grupo: 'Seguridad', db: true,
    detalle: 'Bloquea números/destinos por tabla (global o por usuario) desde la base: complementa a secfilter (que filtra por User-Agent) con una lista de prefijos/destinos prohibidos.',
    requiere: 'NO está empaquetado para Kamailio 6.1 (deb.kamailio.org no lo trae): habría que compilarlo de fuente. Mientras tanto, secfilter + la tabla address (permissions) cubren el bloqueo por IP/UA. Además necesitaría las tablas userblacklist/globalblacklist.' },
];

const porId = Object.fromEntries(MODULOS.map((m) => [m.id, m]));
const esNucleo = (id) => !!(porId[id] && porId[id].nucleo);

// URL de Postgres tal como la ve Kamailio (red host → 127.0.0.1:5432, igual que la cfg base).
// Se usa para los módulos con base de datos (db: true) al generar sus modparam db_url.
function kamDbUrl() {
  if (process.env.KAM_DB_URL) return process.env.KAM_DB_URL;
  const u = process.env.DB_USER || 'sbcng';
  const p = process.env.DB_PASS || '';
  const d = process.env.DB_NAME || 'sbcng';
  return `postgres://${u}:${p}@127.0.0.1:5432/${d}`;
}

/* Genera el fragmento que Kamailio importa: los loadmodule de lo que NO viene ya
 * cargado en el cfg base, y los modparam de todo lo configurado desde el panel. */
function generar(estado) {
  // estado: [{ id, habilitado, params: {k: v} }]
  // Módulos que la cfg BASE (kamailio.cfg) ya carga con loadmodule: NO se re-cargan acá.
  // Kamailio 6.1 deduplica un loadmodule repetido, pero igual ensucia el fragmento y en
  // otras versiones es fatal. topoh entra acá: la base lo carga gateado por env TOPOH
  // (y le pone el mask_ip real por sed); el panel sólo ajusta sus modparam.
  const yaEnBase = ['tm', 'rr', 'dispatcher', 'permissions', 'rtpengine', 'nathelper',
    'websocket', 'uac', 'drouting', 'dialog', 'sst', 'pike', 'secfilter', 'sanity', 'acc',
    'topoh', 'htable', 'sqlops', 'secsipid'];

  const cargas = new Set();
  const params = [];
  const addLoad = (id) => { if (!yaEnBase.includes(id)) cargas.add(`loadmodule "${id}.so"`); };

  for (const e of estado) {
    const m = porId[e.id];
    if (!m) continue;
    const activo = m.nucleo || e.habilitado;
    if (!activo) continue;
    if (m.baseManaged) continue;   // lo gobierna la cfg base (load + modparam), no el panel

    // Compañeros PRIMERO: Kamailio inicializa en orden de carga y algunos módulos se
    // enlazan a otro en su init (registrar→usrloc, auth_db→auth). Si el compañero va
    // después, el init falla ("bind to usrloc before being initialized"). El -c no lo
    // detecta (no corre ese init), pero el arranque real sí: por eso van antes.
    for (const c of (m.companions || [])) addLoad(c);
    addLoad(m.id);

    for (const p of (m.params || [])) {
      const v = (e.params && e.params[p.k] !== undefined && e.params[p.k] !== null && e.params[p.k] !== '')
        ? e.params[p.k] : p.def;
      if (v === undefined || v === null || v === '') continue;
      params.push(p.tipo === 'int'
        ? `modparam("${m.id}", "${p.k}", ${parseInt(v, 10)})`
        : `modparam("${m.id}", "${p.k}", "${String(v).replace(/"/g, '\\"')}")`);
    }
    // Módulos con base de datos: el db_url no es un parámetro que el operador escriba,
    // sale de la conexión real (db_postgres ya está cargado en la cfg base, no se re-carga).
    if (m.db) params.push(`modparam("${m.id}", "db_url", "${kamDbUrl()}")`);

    // Registrar del borde: usrloc + auth_db necesitan sus modparams fijos (no los toca
    // el operador). usrloc en memoria (db_mode 0): las registraciones viven en RAM y el
    // teléfono re-registra solo; no metemos escrituras en el camino caliente. auth_db usa
    // la columna ha1 ya calculada (calculate_ha1=0) contra la tabla subscriber.
    if (m.id === 'registrar') {
      const dburl = kamDbUrl();
      params.push(`modparam("usrloc", "db_url", "${dburl}")`);
      params.push('modparam("usrloc", "db_mode", 0)');
      params.push('modparam("usrloc", "use_domain", 0)');
      params.push(`modparam("auth_db", "db_url", "${dburl}")`);
      params.push('modparam("auth_db", "calculate_ha1", 0)');
      params.push('modparam("auth_db", "password_column", "ha1")');
      params.push('modparam("auth_db", "load_credentials", "")');
      params.push('modparam("auth_db", "use_domain", 0)');
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
