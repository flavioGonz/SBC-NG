'use client';
/* ============================================================================
 *  Login — mismo lenguaje visual que el de PBX-NG: formulario a la izquierda,
 *  hero oscuro a la derecha con las capacidades del producto. Un técnico que ya
 *  entró mil veces a la PBX no tiene que aprender nada nuevo acá.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import { TOKEN_KEY } from '../auth';
import Logo from '../../components/Logo';

const CAPACIDADES = [
  { t: 'Borde SIP', d: 'El SBC-NG en el filo de la red: la central nunca ve internet.' },
  { t: 'Anti-fraude', d: 'Escaneos y fuerza bruta bloqueados antes de tocar la PBX.' },
  { t: 'Transcoding', d: 'Opus ↔ G.729 ↔ G.711 en el motor de medios, por troncal.' },
  { t: 'NAT y WebRTC', d: 'TURN Server y SDP reescrito: el audio llega en los dos sentidos.' },
];

export default function Login() {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(false);
  const [verPass, setVerPass] = useState(false);

  /* Primer arranque: si todavía no hay administrador, en vez de pedir una
   * contraseña que no existe, el panel te deja crearla. Un appliance no debe
   * nacer con admin/admin — así es como termina cualquiera adentro del SBC. */
  const [setup, setSetup] = useState(false);
  useEffect(() => {
    fetch('/backend/api/v1/auth/setup')
      .then((r) => r.json())
      .then((d) => setSetup(!!d.necesita))
      .catch(() => {});
  }, []);

  async function enviar(e) {
    e.preventDefault();
    setErr('');
    if (setup) {
      if (String(p).length < 8) { setErr('La contraseña debe tener al menos 8 caracteres'); return; }
      if (p !== p2) { setErr('Las contraseñas no coinciden'); return; }
    }
    setCargando(true);
    try {
      const r = await fetch(`/backend/api/v1/auth/${setup ? 'setup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });
      // Ojo con el orden: si la respuesta no es JSON (un 500 crudo, o el HTML de
      // error del proxy), r.json() explota y el catch de abajo diría "no se pudo
      // conectar" — mentira, conectamos perfecto. Un error mal reportado hace
      // perder más tiempo que el error mismo.
      const txt = await r.text();
      let d = null;
      try { d = txt ? JSON.parse(txt) : null; } catch (_) { d = null; }

      if (!r.ok) {
        setErr((d && d.error) || `El SBC respondió ${r.status}. Mirá el log del control-plane.`);
        setCargando(false);
        return;
      }
      localStorage.setItem(TOKEN_KEY, d.token);
      window.location.href = '/';
    } catch (_) {
      setErr('No se pudo conectar con el SBC');
      setCargando(false);
    }
  }

  return (
    <div className="sbc-login">
      {/* ── formulario ─────────────────────────────────────────────── */}
      <div className="sbc-login-form">
        <div className="sbc-login-inner">
          {/* El logo, grande y animado: es lo primero que se ve del producto. */}
          <div className="sbc-brand">
            <Logo size={54} />
            <div>
              <div className="sbc-brand-t">SBC-NG</div>
              <div className="sbc-brand-s">Session Border Controller</div>
            </div>
          </div>

          <div className="sbc-head">
            <h2>{setup ? 'Crear el administrador' : 'Iniciar sesión'}</h2>
            <p>
              {setup
                ? 'Es la primera vez que se abre este SBC: elegí el usuario y la contraseña.'
                : 'Panel de administración del borde SIP.'}
            </p>
          </div>

          <form onSubmit={enviar} className="sbc-form" autoComplete="on">
            <label className="sbc-lbl" htmlFor="u">Usuario</label>
            <div className="sbc-field">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="8.5" r="3.4" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
              </svg>
              <input id="u" value={u} onChange={(e) => setU(e.target.value)} placeholder="admin" autoComplete="username" required />
            </div>

            <label className="sbc-lbl" htmlFor="p">Contraseña</label>
            <div className="sbc-field">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="10.5" width="14" height="9" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" strokeLinecap="round" />
              </svg>
              <input id="p" type={verPass ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)}
                     placeholder="••••••••" autoComplete="current-password" required />
              <button type="button" className="sbc-eye" onClick={() => setVerPass((v) => !v)} aria-label="Ver contraseña">
                {verPass ? 'Ocultar' : 'Ver'}
              </button>
            </div>

            {setup && (
              <>
                <label className="sbc-lbl" htmlFor="p2">Repetir contraseña</label>
                <div className="sbc-field">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="5" y="10.5" width="14" height="9" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" strokeLinecap="round" />
                  </svg>
                  <input id="p2" type={verPass ? 'text' : 'password'} value={p2} onChange={(e) => setP2(e.target.value)}
                         placeholder="••••••••" autoComplete="new-password" required />
                </div>
              </>
            )}

            {err && <div className="sbc-err">{err}</div>}

            <button type="submit" className="sbc-btn" disabled={cargando}>
              {cargando ? <span className="sbc-spin" /> : (setup ? 'Crear y entrar' : 'Entrar')}
            </button>
          </form>

          <div className="sbc-foot">
            {setup
              ? 'Mínimo 8 caracteres · nadie más va a ver esta contraseña'
              : 'Deny-by-default · toda la API exige credencial'}
          </div>
        </div>
      </div>

      {/* ── hero ───────────────────────────────────────────────────── */}
      <div className="sbc-hero">
        <div className="sbc-hero-grid" aria-hidden />

        {/* El logo en grande, flotando sobre un halo que respira. Entra dibujándose
            (el escudo primero, después las dos conversaciones) y después no para
            nunca: es la marca, no un adorno que se ve una vez y se apaga. */}
        <div className="sbc-hero-logo" aria-hidden>
          <span className="sbc-halo" />
          <span className="sbc-flota"><Logo size={150} /></span>
        </div>

        <div className="sbc-hero-inner">
          <h1>El borde de tu red<br /><span>hecho producto.</span></h1>
          <p className="sbc-hero-p">
            SBC-NG se para entre internet y tus centrales: normaliza el SIP, arregla el NAT,
            transcodifica lo que haga falta y deja afuera lo que no debe entrar.
          </p>
          <div className="sbc-caps">
            {CAPACIDADES.map((c, i) => (
              <div className="sbc-cap" key={c.t} style={{ animationDelay: `${120 + i * 90}ms` }}>
                <span className="sbc-cap-dot" />
                <div><b>{c.t}</b><span>{c.d}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .sbc-login { min-height: 100vh; display: grid; grid-template-columns: minmax(380px, 44%) 1fr; background: #0d1117; color: #e8ebf0;
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
        @media (max-width: 900px) { .sbc-login { grid-template-columns: 1fr; } .sbc-hero { display: none !important; } }

        .sbc-login-form { display: grid; place-items: center; padding: 40px 28px;
          background: radial-gradient(700px 420px at 20% -10%, rgba(47,116,230,.10), transparent 60%), #0f141d; }
        .sbc-login-inner { width: 100%; max-width: 380px; animation: sbcIn .45s cubic-bezier(.2,.9,.3,1) both; }
        @keyframes sbcIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

        .sbc-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 34px; }
        .sbc-brand-t { font-weight: 800; font-size: 19px; letter-spacing: -.01em; }
        .sbc-brand-s { font-size: 11px; color: #8b94a3; }

        .sbc-head h2 { font-size: 25px; font-weight: 750; margin: 0 0 6px; letter-spacing: -.01em; }
        .sbc-head p { color: #8b94a3; font-size: 13.5px; margin: 0 0 26px; }

        .sbc-lbl { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #8b94a3; margin: 0 0 7px; }
        .sbc-field { display: flex; align-items: center; gap: 10px; padding: 0 12px; height: 46px; margin-bottom: 18px;
          border: 1px solid rgba(120,130,150,.20); border-radius: 12px; background: rgba(255,255,255,.02);
          transition: border-color .18s, box-shadow .18s, background .18s; color: #6b7691; }
        .sbc-field:focus-within { border-color: #2f74e6; box-shadow: 0 0 0 3px rgba(47,116,230,.16); background: rgba(47,116,230,.05); color: #9dbef3; }
        .sbc-field input { flex: 1; background: transparent; border: 0; outline: 0; color: #e8ebf0; font-size: 14.5px; }
        .sbc-field input::placeholder { color: #5e6776; }
        .sbc-eye { background: transparent; border: 0; color: #6b7691; font-size: 11.5px; font-weight: 600; cursor: pointer; padding: 4px 2px; }
        .sbc-eye:hover { color: #9dbef3; }

        .sbc-err { border: 1px solid rgba(240,68,56,.35); background: rgba(240,68,56,.10); color: #ffb4ae;
          border-radius: 10px; padding: 9px 12px; font-size: 13px; margin-bottom: 16px; animation: sbcErr .3s ease; }
        @keyframes sbcErr { 0% { transform: translateX(0); } 25% { transform: translateX(-5px); } 50% { transform: translateX(4px); } 75% { transform: translateX(-2px); } 100% { transform: none; } }

        .sbc-btn { width: 100%; height: 46px; margin-top: 6px; border: 0; border-radius: 12px; cursor: pointer;
          background: linear-gradient(90deg, #2f74e6, #1750c2); color: #fff; font-weight: 700; font-size: 14.5px;
          box-shadow: 0 10px 26px -10px rgba(47,116,230,.75); transition: transform .12s, filter .18s, box-shadow .18s;
          display: grid; place-items: center; }
        .sbc-btn:hover:not(:disabled) { filter: brightness(1.08); box-shadow: 0 14px 32px -10px rgba(47,116,230,.9); }
        .sbc-btn:active:not(:disabled) { transform: scale(.985); }
        .sbc-btn:disabled { opacity: .75; cursor: default; }
        .sbc-spin { width: 18px; height: 18px; border-radius: 50%; border: 2.4px solid rgba(255,255,255,.35); border-top-color: #fff; animation: sbcSpin .7s linear infinite; }
        @keyframes sbcSpin { to { transform: rotate(360deg); } }

        .sbc-foot { margin-top: 26px; font-size: 11.5px; color: #5e6776; text-align: center; }

        .sbc-hero { position: relative; overflow: hidden; display: grid; align-items: center;
          background: linear-gradient(140deg, #0a0f18 0%, #0d1a30 55%, #06232e 100%); }
        .sbc-hero-grid { position: absolute; inset: 0; opacity: .5;
          background-image: linear-gradient(rgba(120,180,230,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(120,180,230,.06) 1px, transparent 1px);
          background-size: 46px 46px; mask-image: radial-gradient(900px 600px at 70% 40%, #000 30%, transparent 75%); }
        .sbc-hero-inner { position: relative; padding: 0 64px; max-width: 620px; }
        .sbc-hero h1 { font-size: 44px; line-height: 1.08; font-weight: 800; letter-spacing: -.025em; margin: 0 0 18px;
          animation: sbcIn .5s .05s cubic-bezier(.2,.9,.3,1) both; }
        .sbc-hero h1 span { background: linear-gradient(90deg, #6a9aec, #4ad0e6); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .sbc-hero-p { color: #9aa4ba; font-size: 15px; line-height: 1.6; margin: 0 0 34px; animation: sbcIn .5s .1s cubic-bezier(.2,.9,.3,1) both; }

        .sbc-caps { display: grid; gap: 14px; }
        .sbc-cap { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 12px;
          border: 1px solid rgba(120,150,220,.14); background: rgba(255,255,255,.025);
          animation: sbcIn .5s cubic-bezier(.2,.9,.3,1) both; transition: border-color .2s, transform .2s, background .2s; }
        .sbc-cap:hover { border-color: rgba(74,208,230,.4); background: rgba(74,208,230,.05); transform: translateX(3px); }
        .sbc-cap-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none;
          background: #4ad0e6; box-shadow: 0 0 0 4px rgba(74,208,230,.14); animation: sbcPip 2.4s ease-in-out infinite; }
        @keyframes sbcPip { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .sbc-cap b { display: block; font-size: 13.5px; font-weight: 700; margin-bottom: 2px; }
        .sbc-cap span { display: block; font-size: 12.5px; color: #8b94a3; line-height: 1.5; }

        @media (prefers-reduced-motion: reduce) {
          .sbc-login-inner, .sbc-hero h1, .sbc-hero-p, .sbc-cap, .sbc-cap-dot, .sbc-spin { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
// fin del login
