'use client';
import { useEffect, useState, useCallback, useRef } from 'react';

/* Todo el panel habla con la API por acá. El Bearer lo pone auth.jsx (fetch parcheado). */
export async function api(path, opts = {}) {
  const r = await fetch('/backend/api/v1' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  const txt = await r.text();
  let d = null; try { d = txt ? JSON.parse(txt) : null; } catch (_) { d = { error: txt }; }
  if (!r.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
  return d;
}

/* GET con recarga periódica. El SBC no tiene websocket (todavía): el estado se
 * consulta cada `ms`. Es barato y hace que el panel no mienta nunca por más de
 * unos segundos, que es lo que importa en un borde. */
export function usePoll(path, ms = 5000, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const vivo = useRef(true);

  const recargar = useCallback(async () => {
    try { const d = await api(path); if (vivo.current) { setData(d); setError(null); } }
    catch (e) { if (vivo.current) setError(e); }
    finally { if (vivo.current) setCargando(false); }
  }, [path]);

  useEffect(() => {
    vivo.current = true; setCargando(true); recargar();
    if (!ms) return () => { vivo.current = false; };
    const t = setInterval(recargar, ms);
    return () => { vivo.current = false; clearInterval(t); };
  }, [path, ms, ...deps]);

  return { data, error, cargando, recargar };
}

export const fmtBytes = (n) => {
  if (!n && n !== 0) return '—';
  const u = ['B', 'kB', 'MB', 'GB', 'TB']; let i = 0; let v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
};
/* Ojo: la API devuelve la tasa en BITS por segundo (rx_bps/tx_bps), que es como se
 * mide un enlace, y el total en BYTES (rx_bytes). No mezclar: 1 Mb/s ≠ 1 MB/s. */
export const fmtBps = (n) => {
  if (n === null || n === undefined) return '—';
  const u = ['b/s', 'kb/s', 'Mb/s', 'Gb/s']; let i = 0; let v = Number(n);
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
};
export const ipDe = (i) => (i && i.direcciones && i.direcciones[0]) || null;
export const fmtUptime = (s) => {
  if (!s && s !== 0) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};
