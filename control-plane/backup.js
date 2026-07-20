/* ============================================================================
 *  SBC-NG · Respaldo y restauración
 *
 *  Mismo formato de manifiesto que PBX-NG a propósito: los dos productos se
 *  respaldan igual, y el restore de cada uno rechaza el archivo del otro mirando
 *  el campo `producto`. Un operador que aprende a respaldar uno ya sabe el otro.
 *
 *  Qué se respalda:
 *
 *    base    pg_dump lógico. Ahí vive TODO lo que se configura del borde: troncales,
 *            reglas de ruteo, manipulación SIP, módulos activos, cuentas del
 *            registrar, números, bloqueos. Es la parte que de verdad importa.
 *    conf    /etc/sbcng — los fragmentos .cfg que el panel le genera a Kamailio, el
 *            modo de ocultamiento de topología, los .env de rtpengine y coturn, y la
 *            clave de firma de STIR/SHAKEN. Sin esto el borde levanta con la
 *            configuración de fábrica.
 *    geoip   OPCIONAL: la base de geolocalización (.mmdb) pesa varios MB y se puede
 *            volver a bajar. Se incluye sólo si se pide, por ejemplo para armar una
 *            instalación que no va a tener internet.
 *
 *  Qué queda afuera:
 *
 *    Las capturas SIP (son de diagnóstico, transitorias y pesadas) y las credenciales
 *    del entorno (DB_PASS, JWT_SECRET): la instalación destino usa las suyas.
 *
 *  OJO, el archivo SÍ es material sensible: `conf` lleva la clave privada de firma de
 *  STIR/SHAKEN y el token de métricas. Si el respaldo no las llevara, un borde
 *  restaurado dejaría de firmar y habría que rehacer el alta con el operador. La
 *  decisión es incluirlas y decirlo fuerte en la pantalla.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const DIR = process.env.BACKUP_DIR || '/respaldos';
const FORMATO = 2;
const PRODUCTO = 'SBC-NG';
const CONF = '/etc/sbcng';

/* Dentro de /etc/sbcng hay cosas que NO son configuración: la base de geolocalización
 * (se baja sola) y las capturas de SIP (diagnóstico). Van excluidas del respaldo
 * normal para que pese poco y se pueda hacer seguido. */
const EXCLUIR = ['./geoip', './capturas', './manuales-img'];

const ENV_REQUERIDAS = ['DB_PASS', 'JWT_SECRET'];

function correr(cmd, args, opts = {}) {
  return new Promise((ok, err) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 64, ...opts }, (e, out, errOut) => {
      if (e) { e.message = `${cmd}: ${(errOut || e.message || '').toString().slice(0, 500)}`; return err(e); }
      ok(out);
    });
  });
}

const sha256 = (f) => new Promise((ok, err) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', err);
});
const existe = (p) => fsp.access(p).then(() => true).catch(() => false);
const pesar = async (f) => { try { return (await fsp.stat(f)).size; } catch (_) { return 0; } };

function nombreNuevo() {
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  return `sbcng-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.tar.gz`;
}

const dbEnv = () => ({
  ...process.env,
  PGHOST: process.env.DB_HOST || 'postgres',
  PGPORT: process.env.DB_PORT || '5432',
  PGDATABASE: process.env.DB_NAME || 'sbcng',
  PGUSER: process.env.DB_USER || 'sbcng',
  PGPASSWORD: process.env.DB_PASS || '',
});

async function versionPg() {
  try { return (await correr('psql', ['-tAc', 'SHOW server_version'], { env: dbEnv() })).trim(); }
  catch (_) { return null; }
}

function seguro(nombre) {
  const base = path.basename(String(nombre || ''));
  if (!base || !base.endsWith('.tar.gz')) throw new Error('nombre de respaldo inválido');
  return path.join(DIR, base);
}

/* ---------------------------------------------------------------- crear ---- */
async function crear({ geoip = false, nota = '' } = {}) {
  await fsp.mkdir(DIR, { recursive: true });
  const trabajo = await fsp.mkdtemp('/tmp/sbcng-bk-');
  const nombre = nombreNuevo();
  const destino = path.join(DIR, nombre);

  try {
    const partes = [];

    const sql = path.join(trabajo, 'base.sql');
    await correr('pg_dump', ['--no-owner', '--no-privileges', '--clean', '--if-exists', '-f', sql], { env: dbEnv() });
    await correr('gzip', ['-9', sql]);
    partes.push({ id: 'base', archivo: 'base.sql.gz', bytes: await pesar(sql + '.gz'), sha256: await sha256(sql + '.gz'),
                  desc: 'Volcado lógico de PostgreSQL (troncales, ruteo, seguridad, módulos)' });

    if (await existe(CONF)) {
      const tgz = path.join(trabajo, 'conf.tar.gz');
      await correr('tar', ['-czf', tgz, ...EXCLUIR.map(e => `--exclude=${e}`), '-C', CONF, '.']);
      partes.push({ id: 'conf', archivo: 'conf.tar.gz', bytes: await pesar(tgz), sha256: await sha256(tgz),
                    desc: 'Fragmentos de Kamailio, .env de medios y clave de STIR/SHAKEN' });
    } else partes.push({ id: 'conf', ausente: true, desc: 'Configuración generada' });

    if (geoip && (await existe(path.join(CONF, 'geoip')))) {
      const tgz = path.join(trabajo, 'geoip.tar.gz');
      await correr('tar', ['-czf', tgz, '-C', path.join(CONF, 'geoip'), '.']);
      partes.push({ id: 'geoip', archivo: 'geoip.tar.gz', bytes: await pesar(tgz), sha256: await sha256(tgz),
                    desc: 'Base de geolocalización por país' });
    } else partes.push({ id: 'geoip', omitida: geoip ? 'no está instalada' : 'no solicitada (se puede volver a bajar)',
                         desc: 'Base de geolocalización por país' });

    const manifiesto = {
      formato: FORMATO,
      producto: PRODUCTO,
      version: process.env.APP_VERSION || null,
      creado: new Date().toISOString(),
      host: process.env.DOMAIN || process.env.PUBLIC_IP || null,
      postgres: await versionPg(),
      nota: String(nota || '').slice(0, 300),
      partes,
      entorno_requerido: ENV_REQUERIDAS,
      aviso: 'No contiene las credenciales del entorno (base, sesiones): el destino usa las suyas. '
           + 'SÍ contiene la clave de firma de STIR/SHAKEN: tratá el archivo como material sensible.',
    };
    await fsp.writeFile(path.join(trabajo, 'manifiesto.json'), JSON.stringify(manifiesto, null, 2));

    await correr('tar', ['-czf', destino, '-C', trabajo, '.']);
    return { nombre, bytes: await pesar(destino), manifiesto };
  } finally {
    await fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {});
  }
}

/* --------------------------------------------------------------- listar ---- */
async function listar() {
  await fsp.mkdir(DIR, { recursive: true });
  const files = (await fsp.readdir(DIR)).filter((f) => f.endsWith('.tar.gz'));
  const out = [];
  for (const f of files) {
    const st = await fsp.stat(path.join(DIR, f)).catch(() => null);
    if (st) out.push({ nombre: f, bytes: st.size, creado: st.mtime.toISOString() });
  }
  return out.sort((a, b) => b.creado.localeCompare(a.creado));
}

async function borrar(nombre) { await fsp.unlink(seguro(nombre)); return true; }

async function inspeccionar(nombre) {
  const f = seguro(nombre);
  const trabajo = await fsp.mkdtemp('/tmp/sbcng-insp-');
  try {
    await correr('tar', ['-xzf', f, '-C', trabajo, './manifiesto.json']);
    const m = JSON.parse(await fsp.readFile(path.join(trabajo, 'manifiesto.json'), 'utf8'));
    return { ...m, compatible: compatibilidad(m) };
  } catch (_) {
    throw new Error('el archivo no parece un respaldo de SBC-NG (no tiene manifiesto)');
  } finally {
    await fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {});
  }
}

function compatibilidad(m) {
  if (!m || m.producto !== PRODUCTO) return { ok: false, motivo: `el respaldo es de ${(m && m.producto) || 'otro producto'}, no de ${PRODUCTO}` };
  if (Number(m.formato) > FORMATO) return { ok: false, motivo: `fue hecho por una versión más nueva (formato ${m.formato}, acá se entiende hasta ${FORMATO})` };
  return { ok: true };
}

/* ------------------------------------------------------------- restaurar --- */
/* A diferencia de la central, acá el restore NO reinicia Kamailio solo: deja los
 * fragmentos en su lugar y devuelve `aplicar: true`. El operador aplica desde el
 * panel, que es el camino que ya tiene validación en Kamailio efímero y rollback
 * automático. Restaurar y aplicar son dos decisiones distintas. */
async function restaurar(nombre, { confirmar = false } = {}) {
  if (!confirmar) throw new Error('falta la confirmación explícita');
  const f = seguro(nombre);
  const m = await inspeccionar(nombre);
  const compat = compatibilidad(m);
  if (!compat.ok) throw new Error('respaldo incompatible: ' + compat.motivo);

  const previo = await crear({ geoip: false, nota: `automático antes de restaurar ${nombre}` });

  const trabajo = await fsp.mkdtemp('/tmp/sbcng-rst-');
  const hechas = [], saltadas = [];
  try {
    await correr('tar', ['-xzf', f, '-C', trabajo]);

    if (await existe(path.join(trabajo, 'base.sql.gz'))) {
      await correr('gunzip', ['-f', path.join(trabajo, 'base.sql.gz')]);
      await correr('psql', ['-v', 'ON_ERROR_STOP=0', '-f', path.join(trabajo, 'base.sql')], { env: dbEnv() });
      hechas.push('base');
    } else saltadas.push('base (no venía en el archivo)');

    for (const [id, dest] of [['conf', CONF], ['geoip', path.join(CONF, 'geoip')]]) {
      const tgz = path.join(trabajo, id + '.tar.gz');
      if (!(await existe(tgz))) { saltadas.push(`${id} (no venía en el archivo)`); continue; }
      await fsp.mkdir(dest, { recursive: true });
      await correr('tar', ['-xzf', tgz, '-C', dest]);
      hechas.push(id);
    }

    return {
      ok: true, restauradas: hechas, saltadas, respaldo_previo: previo.nombre,
      aplicar: hechas.includes('conf') || hechas.includes('base'),
      aviso: 'Andá a Motor SIP → Aplicar para que Kamailio tome la configuración restaurada. '
           + 'Ese camino valida antes de reiniciar y revierte solo si el motor no levanta.',
    };
  } finally {
    await fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { crear, listar, borrar, inspeccionar, restaurar, seguro, DIR, FORMATO };
