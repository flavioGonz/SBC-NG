'use client';
/* ============================================================================
 *  Notificaciones — una sola puerta para todos los avisos del panel.
 *
 *  Por debajo, sileo. Pero sileo, por defecto, pinta TODO el globo del color del
 *  estado: fondo verde y, encima, título verde. Ilegible. El arreglo es separar las
 *  dos cosas que nunca debieron ser una:
 *
 *    · el FONDO es una superficie neutra (la misma tarjeta del panel, clara u
 *      oscura según el tema). Nunca el color del estado.
 *    · el COLOR del estado vive SOLO en el ícono: verde salió bien, rojo salió mal,
 *      ámbar mirá esto, azul te avisé. Un acento, no un baño de color.
 *    · el TEXTO es de alto contraste contra ese fondo, no contra un semáforo.
 *
 *  El resto (posición abajo-centro, ícono SVG animado por tipo) ya estaba bien.
 * ==========================================================================*/
import { sileo } from 'sileo';
import { createElement } from 'react';
import NotifyIcon, { COLORS } from './NotifyIcons';

const MAP = { ok: 'success', bad: 'error', error: 'error', warn: 'warning', info: 'info', action: 'action', load: 'loading' };
const KIND = { success: 1, error: 1, warning: 1, info: 1, action: 1, loading: 1 };

const POSICION = 'bottom-center';

// La superficie del globo, según el tema activo. Se lee en el momento de disparar el
// aviso (no en el import): así respeta el tema aunque el usuario lo haya cambiado recién.
function superficie() {
  if (typeof document === 'undefined') return '#161b22';
  const esOscuro = document.documentElement.getAttribute('data-mantine-color-scheme') !== 'light';
  return esOscuro ? '#1a2230' : '#ffffff';
}

const base = (kind) => ({
  position: POSICION,
  icon: createElement(NotifyIcon, { kind }),
  fill: superficie(),          // ← el fondo es neutro; el color del estado va en el ícono
  roundness: 14,
});

export function toast(message, type = 'ok', opts = {}) {
  if (typeof window === 'undefined') return;
  const state = MAP[type] || (KIND[type] ? type : 'info');
  const kind = opts.icon || state;
  const fn = sileo[state] || sileo.info;   // sileo no expone .loading suelto
  return fn({
    ...base(kind),
    position: opts.position || POSICION,
    title: message,
    description: opts.description || opts.desc,
    type: state,
    duration: opts.duration === undefined ? (state === 'error' ? 5200 : 3400) : opts.duration,
    button: opts.button,
  });
}

/* Para operaciones largas (aplicar una config, reiniciar un motor): un solo toast que
 * pasa de "cargando" a "listo" o "fallo", sin apilar tres avisos. */
export function toastPromise(promise, { loading, success, error }) {
  return sileo.promise(promise, {
    loading: { ...base('loading'), title: loading, type: 'loading' },
    success: (d) => ({ ...base('success'), title: typeof success === 'function' ? success(d) : success, type: 'success' }),
    error: (e) => ({
      ...base('error'),
      title: typeof error === 'function' ? error(e) : error,
      description: String((e && e.message) || ''),
      type: 'error',
      duration: 6000,
    }),
    position: POSICION,
  });
}

export const dismiss = (id) => sileo.dismiss(id);
