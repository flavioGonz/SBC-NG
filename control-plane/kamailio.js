'use strict';
/* Habla con Kamailio por su RPC (jsonrpc sobre HTTP, mi_datagram/xhttp).
 *
 * Antes, la PBX le dejaba "recados" al SBC insertando filas en una tabla
 * (pbxng_sbc_cmd) y un agente hacía polling. Eso ataba los dos productos a la
 * misma base. Acá le hablamos directo: es más rápido, es sincrónico, y no
 * necesita que nadie más comparta nuestra base.
 */
const RPC = process.env.KAMAILIO_RPC || 'http://127.0.0.1:5060/RPC';

async function rpc(method, params = []) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    signal: AbortSignal.timeout(5000),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'error de Kamailio');
  return d.result;
}

const stats = () => rpc('stats.fetch', ['all']);
const uptime = () => rpc('core.uptime');
const version = () => rpc('core.version');
const dispatcherList = () => rpc('dispatcher.list');
const dispatcherReload = () => rpc('dispatcher.reload');
const registrations = () => rpc('ul.dump');
const secfilterReload = () => rpc('secfilter.reload');
const htableGet = (t) => rpc('htable.dump', [t]);
const htableSet = (t, k, v) => rpc('htable.seti', [t, k, v]);
const htableDelete = (t, k) => rpc('htable.delete', [t, k]);
// Llamadas vivas: el modulo dialog las cuenta. ongoing = establecidas; all = incluye las que estan por conectar.
const dlgActivas = () => rpc('dlg.stats_active');

module.exports = {
  rpc, stats, uptime, version,
  dispatcherList, dispatcherReload,
  registrations, secfilterReload,
  htableGet, htableSet, htableDelete,
  dlgActivas,
};
