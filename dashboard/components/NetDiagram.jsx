'use client';
/* ============================================================================
 *  Diagrama de red — el SBC visto por atrás.
 *
 *   · MODO ROUTER → el SBC ES la frontera. Internet entra por la WAN, sale por la
 *     LAN a la central, y en el medio hay una LÍNEA: de un lado el mundo, del otro
 *     la central. Esa línea es todo el producto; por eso se dibuja.
 *
 *   · MODO SWITCH → no hay frontera que dibujar: las placas cuelgan de un puente en
 *     capa 2 y el SBC no está en el medio de nada. Como no hay internet ni central
 *     que mostrar, el lienzo se achica y el equipo queda CENTRADO — no descolgado a
 *     un costado de dos dibujos apagados que ya no significan nada.
 *
 *   · RUTAS ESTÁTICAS → cada una es otro router al que el SBC le entrega tráfico.
 *
 *   · ESTADO REAL → una placa sin cable, apagada o deshabilitada por el operador se
 *     dibuja ATENUADA y con una X: el diagrama no miente sobre lo que está vivo. Un
 *     miembro caído del puente cuelga con línea gris, no con el flujo animado.
 * ==========================================================================*/

const COLOR = { conectada: '#12b76a', sin_cable: '#f04438', apagada: '#64748b', desconocida: '#94a3b8' };
const ROL = {
  wan: { color: '#f79009', texto: 'WAN' },
  lan: { color: '#12b76a', texto: 'LAN' },
  mgmt: { color: '#7c3aed', texto: 'GESTIÓN' },
  sin_uso: { color: '#64748b', texto: '—' },
};

// Una placa "no está viva" si el operador la deshabilitó, o si el kernel la ve sin
// cable / apagada. En cualquiera de esos casos el dibujo la atenúa y no le anima flujo.
const viva = (i) => !i.deshabilitada && i.estado === 'conectada';
const caida = (i) => i.deshabilitada || i.estado === 'sin_cable' || i.estado === 'apagada';

const H = 300;
const EJE = 128;
const CAJA_W = 460, CAJA_Y = 78, CAJA_H = 128;
const P = { w: 44, h: 36, sep: 88 };

function Puerto({ x, y, iface, seleccionada, onClick }) {
  const desh = !!iface.deshabilitada;
  const c = desh ? '#64748b' : (COLOR[iface.estado] || COLOR.desconocida);
  const rol = ROL[iface.rol] || ROL.sin_uso;
  const activa = viva(iface);
  const trafico = activa && ((iface.rx_bps || 0) + (iface.tx_bps || 0) > 0);
  const abajo = caida(iface);
  const nota = desh ? 'DESHABILITADA' : iface.estado === 'sin_cable' ? 'SIN CABLE' : iface.estado === 'apagada' ? 'APAGADA' : null;

  return (
    <g transform={`translate(${x} ${y})`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', opacity: abajo ? 0.5 : 1 }}>
      {seleccionada && <rect x="-8" y="-8" width={P.w + 16} height={P.h + 16} rx="9" fill={rol.color} opacity=".12" />}
      <path d={`M${P.w / 2 - 8} 5 v-5 h16 v5`} fill="none" stroke={c} strokeWidth="1.9" strokeLinejoin="round" />
      <rect x="0" y="5" width={P.w} height={P.h - 5} rx="3.5" fill="none" stroke={c} strokeWidth="2"
            strokeDasharray={desh ? '3 3' : undefined} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <line key={i} x1={6 + i * 4.3} y1="10" x2={6 + i * 4.3} y2="19" stroke={c} strokeWidth="1.1" opacity=".5" />
      ))}
      <circle cx="10" cy="29" r="2.4" fill={activa ? '#12b76a' : '#475569'} className={activa ? 'nd-link' : undefined} />
      <circle cx={P.w - 10} cy="29" r="2.4" fill={trafico ? '#f59e0b' : '#475569'} className={trafico ? 'nd-act' : undefined} />
      {/* La X: cuando la placa está caída, la marca es inequívoca sobre el propio puerto. */}
      {abajo && (
        <g stroke={desh ? '#94a3b8' : '#f04438'} strokeWidth="2.2" strokeLinecap="round">
          <line x1="6" y1="9" x2={P.w - 6} y2={P.h - 4} />
          <line x1={P.w - 6} y1="9" x2="6" y2={P.h - 4} />
        </g>
      )}
      <text x={P.w / 2} y={P.h + 16} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor"
            fontFamily="ui-monospace, monospace">{iface.name}</text>
      {nota
        ? <text x={P.w / 2} y={P.h + 28} textAnchor="middle" fontSize="8" fontWeight="800"
                fill={desh ? '#94a3b8' : '#f04438'} letterSpacing=".05em">{nota}</text>
        : <text x={P.w / 2} y={P.h + 28} textAnchor="middle" fontSize="9" fontWeight="800" fill={rol.color}
                letterSpacing=".06em">{rol.texto}</text>}
    </g>
  );
}

function Router({ x, y, color, etiqueta, sub }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-30" y="-18" width="60" height="36" rx="8" fill="none" stroke={color} strokeWidth="1.8" />
      <path d="M-16 -6 h22 l-5 -5 M14 6 h-22 l5 5" fill="none" stroke={color} strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
      <text x="0" y="32" textAnchor="middle" fontSize="10" fontWeight="700" fill={color} fontFamily="ui-monospace, monospace">
        {etiqueta}
      </text>
      {sub && <text x="0" y="43" textAnchor="middle" fontSize="8.5" fill="currentColor" opacity=".55">{sub}</text>}
    </g>
  );
}

export default function NetDiagram({ modo = 'router', interfaces = [], estaticas = [], seleccion, onSelect, bridge = 'br0' }) {
  const router = modo === 'router';

  // El puente NO es un puerto físico: es virtual, y se dibuja como puente.
  const fisicas = interfaces.filter((i) => i.name !== bridge).slice(0, 5);
  const n = Math.max(fisicas.length, 1);

  // En switch no hay internet ni central que dibujar, asi que el lienzo se achica y la
  // caja queda en el centro real. En router necesitamos los dos costados.
  const W = router ? 1000 : 620;
  const CAJA = { x: (W - CAJA_W) / 2, y: CAJA_Y, w: CAJA_W, h: CAJA_H };

  const anchoFila = n * P.w + (n - 1) * (P.sep - P.w);
  const x0 = CAJA.x + (CAJA.w - anchoFila) / 2;
  const px = (i) => x0 + i * P.sep;
  const py = CAJA.y + 24;
  const cx = (i) => px(i) + P.w / 2;

  const iWan = fisicas.findIndex((i) => i.rol === 'wan');
  const iLan = fisicas.findIndex((i) => i.rol === 'lan');
  const listo = iWan >= 0 && iLan >= 0;
  const miembros = fisicas.map((i, k) => ((i.rol === 'lan' || i.modo === 'bridge') ? k : -1)).filter((k) => k >= 0);

  const rutas = (estaticas || []).filter((r) => r.habilitada).slice(0, 3);
  const yBase = CAJA.y + CAJA.h + 44;

  // La frontera: va JUSTO entre la placa WAN y la placa LAN, no en el medio geometrico.
  const xFrontera = listo ? (cx(iWan) + cx(iLan)) / 2 : W / 2;
  const wanIzq = listo ? cx(iWan) < cx(iLan) : true;

  // ¿La WAN o la LAN están caídas? En router, si una de las dos no está viva, la línea
  // que la toca deja de animarse (gris punteado): el camino no está realmente abierto.
  const wanViva = listo && viva(fisicas[iWan]);
  const lanViva = listo && viva(fisicas[iLan]);

  return (
    <div className="nd-swap" key={modo} style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H + (rutas.length ? 40 : 0)}`} width="100%"
           style={{ maxWidth: W, margin: '0 auto', display: 'block', color: 'var(--mantine-color-text)' }}>

        {router && (
          <>
            {/* internet */}
            <g>
              <path d="M56 130 a19 19 0 0 1 34 -11 a16 16 0 0 1 27 9 a14 14 0 0 1 -3 28 H71 a16 16 0 0 1 -15 -26 Z"
                    fill="none" stroke="#f79009" strokeWidth="2" />
              <text x="96" y="180" textAnchor="middle" fontSize="10" fontWeight="800" fill="#f79009" letterSpacing=".06em">INTERNET</text>
            </g>
            {/* central */}
            <g>
              <rect x="862" y="105" width="80" height="50" rx="7" fill="none" stroke="#12b76a" strokeWidth="2" />
              <line x1="876" y1="121" x2="928" y2="121" stroke="#12b76a" strokeWidth="1.5" />
              <line x1="876" y1="132" x2="928" y2="132" stroke="#12b76a" strokeWidth="1.5" />
              <circle cx="882" cy="145" r="2.2" fill="#12b76a" />
              <text x="902" y="180" textAnchor="middle" fontSize="10" fontWeight="800" fill="#12b76a" letterSpacing=".06em">CENTRAL</text>
            </g>
          </>
        )}

        {/* la carcasa */}
        <rect x={CAJA.x} y={CAJA.y} width={CAJA.w} height={CAJA.h} rx="14"
              fill={router ? 'rgba(120,150,220,.05)' : 'rgba(6,182,212,.07)'}
              stroke={router ? 'rgba(120,150,220,.4)' : 'rgba(6,182,212,.5)'} strokeWidth="1.6" />
        <text x={CAJA.x + CAJA.w / 2} y={CAJA.y + 16} textAnchor="middle" fontSize="9.5" fontWeight="800"
              fill="currentColor" opacity=".5" letterSpacing=".1em">
          SBC-NG · {router ? 'MODO ROUTER' : 'MODO SWITCH'}
        </text>

        {router ? (
          <>
            {listo && (
              <>
                {/* LA FRONTERA. De un lado el mundo, del otro la central. */}
                <line x1={xFrontera} y1="20" x2={xFrontera} y2={CAJA.y + CAJA.h + 34}
                      stroke="rgba(140,120,220,.55)" strokeWidth="1.4" strokeDasharray="6 5" />
                <text x={xFrontera - 10} y="30" textAnchor="end" fontSize="8.5" fontWeight="800"
                      fill={wanIzq ? '#f79009' : '#12b76a'} letterSpacing=".08em">
                  {wanIzq ? 'AFUERA · NO CONFIABLE' : 'ADENTRO · CONFIABLE'}
                </text>
                <text x={xFrontera + 10} y="30" textAnchor="start" fontSize="8.5" fontWeight="800"
                      fill={wanIzq ? '#12b76a' : '#f79009'} letterSpacing=".08em">
                  {wanIzq ? 'ADENTRO · CONFIABLE' : 'AFUERA · NO CONFIABLE'}
                </text>

                <path d={`M124 ${EJE} H ${cx(iWan)} V ${py}`} fill="none" stroke={wanViva ? '#f79009' : '#64748b'}
                      strokeWidth="2" strokeDasharray={wanViva ? undefined : '5 5'} className={wanViva ? 'nd-flujo' : undefined} />
                <path d={`M ${cx(iLan)} ${py} V ${EJE} H 862`} fill="none" stroke={lanViva ? '#12b76a' : '#64748b'}
                      strokeWidth="2" strokeDasharray={lanViva ? undefined : '5 5'} className={lanViva ? 'nd-flujo' : undefined} />
                <line x1={cx(iWan)} y1={CAJA.y + CAJA.h - 20} x2={cx(iLan)} y2={CAJA.y + CAJA.h - 20}
                      stroke="rgba(120,150,220,.5)" strokeWidth="1.5" strokeDasharray="3 4" />
              </>
            )}
            {!listo && (
              <text x={W / 2} y={CAJA.y + CAJA.h + 26} textAnchor="middle" fontSize="11" fontWeight="600" fill="#f04438">
                Elegí cuál placa es la WAN y cuál la LAN
              </text>
            )}
          </>
        ) : (
          <>
            <rect x={CAJA.x + CAJA.w / 2 - 48} y={CAJA.y + CAJA.h - 34} width="96" height="24" rx="8"
                  fill="rgba(6,182,212,.12)" stroke="#06b6d4" strokeWidth="1.8" />
            <text x={CAJA.x + CAJA.w / 2} y={CAJA.y + CAJA.h - 18} textAnchor="middle" fontSize="10.5" fontWeight="800"
                  fill="#06b6d4" fontFamily="ui-monospace, monospace">{bridge}</text>
            <text x={CAJA.x + CAJA.w / 2} y={CAJA.y + CAJA.h + 20} textAnchor="middle" fontSize="9.5" fontWeight="700"
                  fill="#06b6d4" letterSpacing=".05em">
              PUENTE EN CAPA 2 · sin NAT, sin ruteo
            </text>
            {miembros.map((k) => {
              const activo = viva(fisicas[k]);
              return (
                <line key={k} x1={cx(k)} y1={py + P.h} x2={CAJA.x + CAJA.w / 2} y2={CAJA.y + CAJA.h - 34}
                      stroke={activo ? '#06b6d4' : '#64748b'} strokeWidth="1.6" strokeDasharray="4 4"
                      opacity={activo ? 1 : 0.4} className={activo ? 'nd-flujo' : undefined} />
              );
            })}
            {miembros.filter((k) => viva(fisicas[k])).length < 2 && (
              <text x={W / 2} y={CAJA.y + CAJA.h + 34} textAnchor="middle" fontSize="11" fontWeight="600" fill="#f04438">
                Hacen falta al menos dos placas LAN conectadas para armar el puente
              </text>
            )}
          </>
        )}

        {fisicas.map((i, k) => (
          <Puerto key={i.name} x={px(k)} y={py} iface={i} seleccionada={seleccion === i.name}
                  onClick={onSelect ? () => onSelect(i.name) : undefined} />
        ))}

        {rutas.map((r, k) => {
          const x = (W / (rutas.length + 1)) * (k + 1);
          const salida = fisicas.findIndex((i) => i.name === r.iface);
          const desde = salida >= 0 ? cx(salida) : CAJA.x + CAJA.w / 2;
          return (
            <g key={r.id}>
              <path d={`M ${desde} ${CAJA.y + CAJA.h} V ${yBase - 20} H ${x}`} fill="none"
                    stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="4 4" className="nd-flujo" />
              <Router x={x} y={yBase} color="#7c3aed" etiqueta={r.gateway || r.iface} sub={r.destino} />
            </g>
          );
        })}
      </svg>

      <style jsx>{`
        :global(.nd-link) { animation: ndLatido 2.4s ease-in-out infinite; }
        @keyframes ndLatido { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
        :global(.nd-act) { animation: ndParpadeo .35s steps(2, end) infinite; }
        @keyframes ndParpadeo { 0% { opacity: 1; } 100% { opacity: .2; } }
        :global(.nd-flujo) { stroke-dasharray: 6 8; animation: ndFlujo 1.1s linear infinite; }
        @keyframes ndFlujo { to { stroke-dashoffset: -28; } }
        .nd-swap { animation: ndSwap .42s cubic-bezier(.2,.7,.3,1) both; }
        @keyframes ndSwap { from { opacity: 0; transform: scale(.955); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          :global(.nd-link), :global(.nd-act), :global(.nd-flujo) { animation: none; }
        }
      `}</style>
    </div>
  );
}
