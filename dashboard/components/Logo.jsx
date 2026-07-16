'use client';
/* ============================================================================
 *  Logo de SBC-NG — el escudo con los dos diálogos.
 *
 *  El escudo es lo que el producto hace (protege el borde); las dos burbujas
 *  encadenadas son las dos conversaciones que el SBC empalma: la de afuera
 *  (internet, el operador) y la de adentro (la central). Se tocan pero no se
 *  mezclan — que es exactamente el punto de un Session Border Controller.
 *
 *  Animado: el escudo se dibuja de un trazo, las burbujas entran una detrás de
 *  la otra y después el conjunto respira despacio. Con prefers-reduced-motion
 *  queda quieto, sin excusas.
 * ==========================================================================*/

export default function Logo({ size = 40, animado = true, color = '#22c55e', texto = false }) {
  const cls = animado ? 'logo-vivo' : '';
  return (
    <span className={`sbc-logo ${cls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="SBC-NG">
        <defs>
          <linearGradient id="sbcEsc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4ade80" />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>

        {/* escudo */}
        <path
          className="sbc-escudo"
          d="M32 4.5 L56 13.5 V31 c0 14.4 -9.9 25.5 -24 28.5 C17.9 56.5 8 45.4 8 31 V13.5 Z"
          fill="none" stroke="url(#sbcEsc)" strokeWidth="3.4" strokeLinejoin="round"
        />

        {/* burbuja de afuera (verde): la conversación con internet */}
        <path
          className="sbc-burbuja sbc-burbuja-a"
          d="M20 20 h13 a3.5 3.5 0 0 1 3.5 3.5 v9 a3.5 3.5 0 0 1 -3.5 3.5 h-6 l-5 5 v-5 h-2 a3.5 3.5 0 0 1 -3.5 -3.5 v-9 A3.5 3.5 0 0 1 20 20 Z"
          fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round"
        />

        {/* burbuja de adentro (blanca): la conversación con la central */}
        <path
          className="sbc-burbuja sbc-burbuja-b"
          d="M31 27.5 h13 a3.5 3.5 0 0 1 3.5 3.5 v9 A3.5 3.5 0 0 1 44 43.5 h-2 v5 l-5 -5 h-6 a3.5 3.5 0 0 1 -3.5 -3.5 v-9 a3.5 3.5 0 0 1 3.5 -3.5 Z"
          fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"
        />
      </svg>

      {texto && (
        <span className="sbc-logo-txt" style={{ fontWeight: 800, letterSpacing: '-.01em', fontSize: size * 0.44 }}>
          SBC-NG
        </span>
      )}

      <style jsx>{`
        .sbc-logo { color: currentColor; }

        /* El escudo se dibuja: 200 es de sobra para el perímetro del path. */
        :global(.logo-vivo .sbc-escudo) {
          stroke-dasharray: 210;
          stroke-dashoffset: 210;
          animation: sbcTrazo 1.1s cubic-bezier(.4, 0, .2, 1) forwards,
                     sbcRespira 4.5s 1.3s ease-in-out infinite;
        }
        @keyframes sbcTrazo { to { stroke-dashoffset: 0; } }
        @keyframes sbcRespira {
          0%, 100% { opacity: 1; }
          50%      { opacity: .72; }
        }

        /* Las burbujas entran después del escudo, una y después la otra:
           primero llega la llamada de afuera, después se la pasamos adentro. */
        :global(.logo-vivo .sbc-burbuja) {
          stroke-dasharray: 120;
          stroke-dashoffset: 120;
          transform-origin: 32px 32px;
        }
        :global(.logo-vivo .sbc-burbuja-a) { animation: sbcTrazoB .7s .55s ease forwards, sbcLatido 4.5s 1.5s ease-in-out infinite; }
        :global(.logo-vivo .sbc-burbuja-b) { animation: sbcTrazoB .7s .85s ease forwards, sbcLatido 4.5s 1.9s ease-in-out infinite; }
        @keyframes sbcTrazoB { to { stroke-dashoffset: 0; } }
        @keyframes sbcLatido {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.045); }
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.logo-vivo .sbc-escudo),
          :global(.logo-vivo .sbc-burbuja) { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>
    </span>
  );
}
