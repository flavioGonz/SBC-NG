'use client';
/* Iconografía de las notificaciones: SVG de trazo que se dibuja al aparecer.
 * Un ícono por tipo, para reconocer el aviso de un vistazo sin leerlo.
 * Los tres últimos son propios del SBC: enlace de red, bloqueo y troncal. */
const S = { fill: 'none', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Wrap({ color, children, spin }) {
  return (
    <span className="sbc-nico" style={{ '--nc': color }}>
      <svg width="20" height="20" viewBox="0 0 24 24" className={spin ? 'sbc-nico-spin' : undefined}>
        <circle cx="12" cy="12" r="10.5" fill="none" stroke={color} strokeWidth="1.6" opacity=".22" />
        {children}
      </svg>
    </span>
  );
}

export const COLORS = {
  success: '#12b76a', error: '#f04438', warning: '#f79009', info: '#2f80ff',
  action: '#7c3aed', loading: '#2f80ff',
  enlace: '#06b6d4', bloqueo: '#f04438', troncal: '#0ea5e9',
};

export function NotifyIcon({ kind = 'info' }) {
  const c = COLORS[kind] || COLORS.info;
  switch (kind) {
    case 'success':
      return <Wrap color={c}><path className="sbc-draw" d="M7 12.6l3.2 3.2L17.2 8.4" stroke={c} {...S} /></Wrap>;
    case 'error':
      return <Wrap color={c}><g className="sbc-draw"><path d="M8.6 8.6l6.8 6.8" stroke={c} {...S} /><path d="M15.4 8.6l-6.8 6.8" stroke={c} {...S} /></g></Wrap>;
    case 'warning':
      return <Wrap color={c}><g className="sbc-draw"><path d="M12 7.2v6" stroke={c} {...S} /><circle cx="12" cy="16.6" r="1.1" fill={c} /></g></Wrap>;
    case 'loading':
      return <Wrap color={c} spin><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" stroke={c} {...S} /></Wrap>;
    case 'action':
      return <Wrap color={c}><path className="sbc-draw" d="M9.5 7l5.5 5-5.5 5" stroke={c} {...S} /></Wrap>;
    case 'enlace':   // interfaz de red: el conector
      return <Wrap color={c}><g className="sbc-draw"><rect x="7" y="8" width="10" height="8" rx="1.6" stroke={c} {...S} /><path d="M12 16v3" stroke={c} {...S} /></g></Wrap>;
    case 'bloqueo':  // escudo con candado
      return <Wrap color={c}><g className="sbc-draw"><path d="M12 4.6l6 2.4v4.4c0 3.6-2.5 6.6-6 7.6-3.5-1-6-4-6-7.6V7z" stroke={c} {...S} /><path d="M9.6 12h4.8M12 12v2.6" stroke={c} {...S} /></g></Wrap>;
    case 'troncal':  // dos puntas conectadas
      return <Wrap color={c}><g className="sbc-draw"><circle cx="7.6" cy="12" r="2" stroke={c} {...S} /><circle cx="16.4" cy="12" r="2" stroke={c} {...S} /><path d="M9.6 12h4.8" stroke={c} {...S} /></g></Wrap>;
    default:
      return <Wrap color={c}><g className="sbc-draw"><path d="M12 11.2v5" stroke={c} {...S} /><circle cx="12" cy="7.6" r="1.1" fill={c} /></g></Wrap>;
  }
}
export default NotifyIcon;
