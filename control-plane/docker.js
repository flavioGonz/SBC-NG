'use strict';
/* ============================================================================
 *  SBC-NG · reinicio de motores
 *
 *  Kamailio, rtpengine y coturn leen su configuración UNA vez, al arrancar. No
 *  hay "reload" que valga para el rango de puertos RTP o el external-ip del TURN:
 *  hay que reiniciar el proceso. Para eso el control-plane habla con el socket de
 *  Docker.
 *
 *  Eso es poder de sobra, así que va con candado: sólo se puede reiniciar un
 *  contenedor de esta lista. Ni un `docker run`, ni un exec, ni tocar nada que no
 *  sea del propio SBC. Si mañana alguien inyecta un nombre por la API, lo peor que
 *  puede lograr es reiniciar un servicio que ya sabemos reiniciar.
 * ==========================================================================*/
const http = require('http');

const SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const PROYECTO = process.env.COMPOSE_PROJECT || 'sbcng';

// Los únicos motores que este proceso puede tocar.
const MOTORES = {
  kamailio: `${PROYECTO}-kamailio-1`,
  rtpengine: `${PROYECTO}-rtpengine-1`,
  coturn: `${PROYECTO}-coturn-1`,
};

function pedir(metodo, ruta) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: SOCKET, method: metodo, path: ruta, timeout: 20000 },
      (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(b ? safe(b) : null);
          reject(new Error(`docker ${res.statusCode}: ${b.slice(0, 200)}`));
        });
      });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout hablando con Docker')));
    req.end();
  });
}
const safe = (s) => { try { return JSON.parse(s); } catch (_) { return s; } };

// Un 404 de Docker no es un error de programación: es que ese motor no está
// desplegado (coturn, por ejemplo, sólo existe si se levantó el perfil `turn`).
// Decirlo así ahorra la media hora de buscar un bug que no existe.
const traducir = (e, motor, nombre) => {
  if (/404/.test(e.message)) {
    return new Error(`el motor ${motor} no está desplegado en este SBC (no existe el contenedor ${nombre}). ` +
      `Levantalo con: docker compose --profile turn up -d ${motor}`);
  }
  return e;
};

async function reiniciar(motor) {
  const nombre = MOTORES[motor];
  if (!nombre) throw new Error(`motor desconocido: ${motor}`);
  try {
    // Si estaba parado, restart lo levanta igual: sirve para los dos casos.
    await pedir('POST', `/containers/${nombre}/restart?t=10`);
    return { motor, contenedor: nombre, reiniciado: true };
  } catch (e) { throw traducir(e, motor, nombre); }
}

async function estado(motor) {
  const nombre = MOTORES[motor];
  if (!nombre) throw new Error(`motor desconocido: ${motor}`);
  try {
    const d = await pedir('GET', `/containers/${nombre}/json`);
    const s = (d && d.State) || {};
    return { motor, corriendo: !!s.Running, desde: s.StartedAt || null, reinicios: s.RestartCount || 0, desplegado: true };
  } catch (e) {
    if (/404/.test(e.message)) return { motor, corriendo: false, desplegado: false };
    throw e;
  }
}

const disponible = async () => { try { await pedir('GET', '/_ping'); return true; } catch (_) { return false; } };


/* ─────────────── validar una config ANTES de aplicarla ───────────────
 *
 * Esta es la diferencia entre un panel de modulos y una ruleta rusa. Kamailio valida
 * su config con `kamailio -c`: si el fragmento tiene un loadmodule inexistente o un
 * modparam mal escrito, lo dice y sale con error. Lo corremos en un contenedor EFIMERO
 * —misma imagen, misma config, montando el volumen— para enterarnos ANTES de tocar el
 * que esta atendiendo llamadas.
 *
 * Sin esto, un panel de modulos no te rompe una pantalla: te deja el borde sin
 * arrancar, o sea sin telefonia, y con el tecnico buscando en el lugar equivocado.
 */
function pedirJSON(metodo, ruta, cuerpo) {
  return new Promise((resolve, reject) => {
    const datos = cuerpo ? JSON.stringify(cuerpo) : null;
    const req = http.request({
      socketPath: SOCKET, method: metodo, path: ruta, timeout: 30000,
      headers: datos ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos) } : {},
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(b ? safe(b) : null);
        reject(new Error(`docker ${res.statusCode}: ${b.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout hablando con Docker')));
    if (datos) req.write(datos);
    req.end();
  });
}

async function validarKamailio() {
  const imagen = process.env.KAMAILIO_IMAGE || `sbcng/kamailio:${process.env.VERSION || '0.1.0'}`;

  // Un contenedor de un solo uso: valida y se muere. No toca la red ni la base.
  const c = await pedirJSON('POST', '/containers/create', {
    Image: imagen,
    Entrypoint: ['/bin/sh', '-c'],
    // El entrypoint normal materializa los fragmentos del volumen y despues valida.
    // Acá hacemos lo mismo, pero sin arrancar nada: sólo `kamailio -c`.
    Cmd: [
      'cp /etc/sbcng/reglas.cfg /etc/kamailio/reglas.cfg 2>/dev/null; ' +
      'cp /etc/sbcng/seguridad.cfg /etc/kamailio/seguridad.cfg 2>/dev/null; ' +
      'cp /etc/sbcng/modulos.cfg /etc/kamailio/modulos.cfg 2>/dev/null; ' +
      'cp /etc/sbcng/stir.cfg /etc/kamailio/stir.cfg 2>/dev/null; ' +
      // geoblock y tls_native tambien se incluyen desde la base: si faltan, un default
      // inerte para que el include resuelva (si no, kamailio -c falla por archivo ausente).
      'cp /etc/sbcng/geoblock.cfg /etc/kamailio/geoblock.cfg 2>/dev/null || echo "route[GEOBLOCK]{return;}" > /etc/kamailio/geoblock.cfg; ' +
      'cp /etc/sbcng/registrar.cfg /etc/kamailio/registrar.cfg 2>/dev/null || echo "# registrar off" > /etc/kamailio/registrar.cfg; ' +
      'cp /etc/sbcng/dids.cfg /etc/kamailio/dids.cfg 2>/dev/null || echo "# sin dids" > /etc/kamailio/dids.cfg; ' +
      'cp /etc/sbcng/tls_native.cfg /etc/kamailio/tls_native.cfg 2>/dev/null || echo "# tls off" > /etc/kamailio/tls_native.cfg; ' +
      // el modo TLS nativo carga tls.so y lee /etc/kamailio/tls.cfg con un cert: lo
      // preparamos (autofirmado efimero) para que la validacion del modo nativo no falle.
      'mkdir -p /etc/kamailio/tls; [ -f /etc/kamailio/tls/self.crt ] || openssl req -x509 -newkey rsa:2048 -nodes -days 3 -keyout /etc/kamailio/tls/self.key -out /etc/kamailio/tls/self.crt -subj "/CN=validate" >/dev/null 2>&1; ' +
      'printf "[server:default]\\nprivate_key = /etc/kamailio/tls/self.key\\ncertificate = /etc/kamailio/tls/self.crt\\nverify_certificate = no\\nrequire_certificate = no\\n[client:default]\\nverify_certificate = no\\nrequire_certificate = no\\n" > /etc/kamailio/tls.cfg; ' +
      // Sustituimos TODOS los @@TOKENS@@ (igual que el entrypoint): si queda uno literal
      // —sobre todo @@TOPOH_DEFINE@@, que es una directiva— kamailio -c da parse error.
      'sed -i "s|@@DB_URL@@|postgres://x:x@127.0.0.1:5432/x|g; s|@@SELF_IP@@|127.0.0.1|g; ' +
      's|@@PUBLIC_IP@@|127.0.0.1|g; s|@@TRUSTED_NET@@|127.0.0.0/24|g; s|@@METRICS_TOKEN@@|x|g; ' +
      's|@@TOPOH_KEY@@|validatekey|g; s|@@TOPOH_DEFINE@@|@@TOPOHDEF@@|g" /etc/kamailio/kamailio.cfg; ' +
      // topoh/topos son excluyentes: la validación tiene que usar el MISMO modo que el
      // arranque real, si no validaríamos una config que después no es la que corre.
      'TD="#!define SBCNG_TOPOH"; ' +
      'if [ -f /etc/sbcng/topo.mode ]; then M=$(tr -d "[:space:]" < /etc/sbcng/topo.mode); ' +
      '  [ "$M" = "topos" ] && TD="# topoh off (topos)"; [ "$M" = "none" ] && TD="# topo off"; fi; ' +
      'sed -i "s|@@TOPOHDEF@@|${TD}|g" /etc/kamailio/kamailio.cfg; ' +
      'kamailio -c -f /etc/kamailio/kamailio.cfg',
    ],
    HostConfig: {
      Binds: [`${process.env.COMPOSE_PROJECT || 'sbcng'}_sbc_conf:/etc/sbcng:ro`],
      AutoRemove: false,
      NetworkMode: 'none',
    },
  });

  const id = c.Id;
  try {
    await pedirJSON('POST', `/containers/${id}/start`);
    const fin = await pedirJSON('POST', `/containers/${id}/wait`);
    const salida = await pedir('GET', `/containers/${id}/logs?stdout=1&stderr=1`);
    // los logs de docker vienen con 8 bytes de cabecera por linea: los limpiamos
    const texto = String(salida).replace(/[\x00-\x08]/g, '').trim();
    const ok = fin && fin.StatusCode === 0;
    return { ok, salida: texto.slice(-1500) };
  } finally {
    await pedirJSON('DELETE', `/containers/${id}?force=1`).catch(() => {});
  }
}

/* ¿El borde volvió a la vida después de reiniciarlo? Si en `intentos` segundos no
 * contesta el RPC, la config nueva lo mató y hay que volver atrás. */
async function esperarVivo(intentos = 15) {
  const kam = require('./kamailio');
  for (let i = 0; i < intentos; i++) {
    try { await kam.version(); return true; } catch (_) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// Lista de contenedores del stack con estado + CPU/mem (stats one-shot en paralelo).
// Para el Resumen: saber que esta arriba y cuanto come, sin salir del panel.
async function contenedores() {
  const lista = await pedirJSON('GET', '/containers/json?all=1');
  return Promise.all((lista || []).map(async (c) => {
    let cpu = null, mem = null, memLimit = null;
    try {
      const st = await pedirJSON('GET', `/containers/${c.Id}/stats?stream=false`);
      const cd = st.cpu_stats.cpu_usage.total_usage - st.precpu_stats.cpu_usage.total_usage;
      const sd = st.cpu_stats.system_cpu_usage - st.precpu_stats.system_cpu_usage;
      const cores = st.cpu_stats.online_cpus || (st.cpu_stats.cpu_usage.percpu_usage || []).length || 1;
      if (sd > 0 && cd >= 0) cpu = Math.round((cd / sd) * cores * 1000) / 10;
      mem = (st.memory_stats && st.memory_stats.usage) || null;
      memLimit = (st.memory_stats && st.memory_stats.limit) || null;
    } catch (_) {}
    return { name: ((c.Names && c.Names[0]) || '').replace(/^\//, ''), image: c.Image,
             state: c.State, status: c.Status, cpu, mem, memLimit };
  }));
}

module.exports = { reiniciar, estado, disponible, validarKamailio, esperarVivo, contenedores, MOTORES };
