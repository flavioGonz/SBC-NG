'use client';
/* Sesión del panel. Igual que en PBX-NG: el JWT vive en localStorage y se inyecta
 * como Bearer en TODO fetch que vaya a /backend. Si la API contesta 401, se limpia
 * y se vuelve al login — nunca dejamos una pantalla a medio cargar mostrando datos
 * viejos de una sesión que ya venció. */
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const Ctx = createContext(null);
export const TOKEN_KEY = 'sbcng_jwt';

let patched = false;
function patchFetch() {
  if (patched || typeof window === 'undefined') return; patched = true;
  const orig = window.fetch.bind(window);
  window.fetch = (url, opts = {}) => {
    try {
      const u = typeof url === 'string' ? url : (url && url.url);
      if (u && u.indexOf('/backend') === 0) {
        const t = localStorage.getItem(TOKEN_KEY);
        opts = { ...opts, headers: { ...(opts.headers || {}), ...(t ? { Authorization: 'Bearer ' + t } : {}) } };
      }
    } catch (_) {}
    return orig(url, opts).then((r) => {
      if (r.status === 401 && !location.pathname.startsWith('/login')) {
        localStorage.removeItem(TOKEN_KEY); location.href = '/login';
      }
      return r;
    });
  };
}
if (typeof window !== 'undefined') patchFetch();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const path = usePathname(); const router = useRouter();
  useEffect(() => { patchFetch(); }, []);
  useEffect(() => {
    if (path === '/login') { setUser(null); return; }
    const t = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    if (!t) { setUser(null); router.replace('/login'); return; }
    fetch('/backend/api/v1/auth/me')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUser(d.user))
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setUser(null); router.replace('/login'); });
  }, [path]);
  return <Ctx.Provider value={{ user, setUser }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx) || {};
export function logout() {
  if (typeof window !== 'undefined') { localStorage.removeItem(TOKEN_KEY); location.href = '/login'; }
}
