'use client';
/* ============================================================================
 *  Mapa de ataques — de qué países viene el fuego, en vivo.
 *
 *  Full-bleed, SIN bordes ni tarjeta: el mapa ocupa todo el bloque y los datos
 *  (título, orígenes en vivo y top de países) van montados ENCIMA como overlay,
 *  sobre un degradado que los hace legibles. Proyección equirectangular
 *  (lon -180..180 → x, lat 90..-90 → y), un punto pulsante por país atacante con
 *  tamaño según cuántos golpes metió. Se alimenta de `top_paises` de /soc (ya
 *  geolocalizado y cacheado en el server) — el refresco lo dispara el socket.
 * ==========================================================================*/
import { useState } from 'react';
import { Group, Text, Badge, Tooltip } from '@mantine/core';
import { IconWorldBolt, IconBan, IconFlame, IconWorld, IconShieldCheck, IconLockOff } from '@tabler/icons-react';

// Centroide aproximado (lat, lon) de los países que solemos ver atacando.
const LL = {
  US: [38, -97], CA: [56, -106], BR: [-10, -55], DE: [51, 10], NL: [52, 5], GB: [54, -2],
  FR: [46, 2], RU: [61, 100], CN: [35, 105], IN: [21, 78], UA: [49, 32], TR: [39, 35],
  VN: [16, 108], ID: [-2, 118], IR: [32, 53], PK: [30, 70], RO: [46, 25], PL: [52, 19],
  KR: [37, 128], JP: [36, 138], MX: [23, -102], AR: [-38, -63], CL: [-30, -71], CO: [4, -72],
  PE: [-10, -76], ES: [40, -4], IT: [42, 12], PT: [39, -8], SE: [62, 15], CH: [47, 8],
  SG: [1, 104], HK: [22, 114], TW: [24, 121], TH: [15, 101], MY: [4, 102], PH: [13, 122],
  ZA: [-29, 24], NG: [9, 8], EG: [26, 30], MA: [32, -6], SA: [24, 45], AE: [24, 54],
  IL: [31, 35], AU: [-25, 133], NZ: [-42, 174], BG: [43, 25], CZ: [50, 15], HU: [47, 19],
  GR: [39, 22], RS: [44, 21], MD: [47, 28], BY: [53, 28], KZ: [48, 67], LT: [55, 24],
  LV: [57, 25], UY: [-33, -56], PY: [-23, -58], BO: [-17, -64], EC: [-2, -78], VE: [8, -66],
  BE: [50, 4], SC: [-4, 55], LU: [49, 6], IE: [53, -8], FI: [64, 26], NO: [62, 10], DK: [56, 9],
  AT: [47, 14], HR: [45, 15], SK: [48, 19], EE: [58, 25], IS: [65, -18], BD: [23, 90],
};
const flagUrl = (cc) => `https://flagcdn.com/${String(cc).toLowerCase()}.svg`;

export default function AttackMap({ paises = [], kpis = {}, titulo = 'Mapa de ataques en vivo' }) {
  const [imgOk, setImgOk] = useState(true);
  const pts = (paises || [])
    .map((p) => { const ll = LL[String(p.cc || '').toUpperCase()]; return ll ? { ...p, lat: ll[0], lon: ll[1] } : null; })
    .filter(Boolean);
  const maxN = Math.max(1, ...pts.map((p) => p.n || 1));
  const top = [...pts].sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 6);

  const k = kpis || {};
  const KPIS = [
    { label: 'IPs bloqueadas', value: k.bloqueados || 0, color: '#f04438', Icon: IconBan },
    { label: 'Últimas 24 h',   value: k.ultimas_24h || 0, color: '#f79009', Icon: IconFlame },
    { label: 'Países origen',  value: k.paises || 0,       color: '#c084fc', Icon: IconWorld },
    { label: 'Mitigaciones',   value: k.mitigaciones || 0, color: '#12b886', Icon: IconShieldCheck },
    { label: 'Permanentes',    value: k.permanentes || 0,  color: '#94a3b8', Icon: IconLockOff },
  ];

  return (
    <div className="sbc-fade-in" style={{
      position: 'relative', width: '100%', height: '100%', minHeight: 380, borderRadius: 14, overflow: 'hidden',
      background: 'radial-gradient(120% 120% at 50% 15%, #0e2036 0%, #0a1524 55%, #060b14 100%)',
      boxShadow: 'inset 0 0 60px rgba(0,0,0,.45)',
    }}>
      <style jsx>{`
        @keyframes amPing { 0% { transform: scale(.6); opacity: .9; } 100% { transform: scale(2.6); opacity: 0; } }
        @keyframes amDot { 0%,100% { transform: scale(1); } 50% { transform: scale(1.25); } }
        @keyframes amLive { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
      `}</style>

      {/* mapa mundi tenue (equirectangular); si no carga, queda el graticule */}
      {imgOk && (
        <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Equirectangular_projection_SW.jpg"
          alt="" onError={() => setImgOk(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill',
                   opacity: .24, filter: 'grayscale(1) brightness(1.55) contrast(.85)' }} />
      )}
      {/* graticule sutil */}
      <svg viewBox="0 0 360 180" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: .16 }}>
        {[30, 60, 90, 120, 150].map((y) => <line key={'h' + y} x1="0" x2="360" y1={y} y2={y} stroke="#5b7fb0" strokeWidth=".4" />)}
        {[60, 120, 180, 240, 300].map((x) => <line key={'v' + x} x1={x} x2={x} y1="0" y2="180" stroke="#5b7fb0" strokeWidth=".4" />)}
      </svg>

      {/* puntos de ataque */}
      {pts.map((p) => {
        const x = ((p.lon + 180) / 360) * 100;
        const y = ((90 - p.lat) / 180) * 100;
        const sz = 7 + Math.round(((p.n || 1) / maxN) * 12);
        const n = p.n || 1;
        return (
          <Tooltip key={p.cc} withArrow position="top" color="dark"
            label={
              <Group gap={6} wrap="nowrap">
                <img src={flagUrl(p.cc)} alt="" width={18} height={13} style={{ borderRadius: 2, objectFit: 'cover' }} />
                <span>{p.pais || p.cc} · {n} golpe{n === 1 ? '' : 's'}</span>
              </Group>
            }>
            <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)',
                          width: sz + 14, height: sz + 14, cursor: 'help', zIndex: 3 }}>
              <span style={{ position: 'absolute', left: '50%', top: '50%', width: sz, height: sz, marginLeft: -sz / 2, marginTop: -sz / 2,
                             borderRadius: '50%', border: '2px solid rgba(240,68,56,.7)', animation: 'amPing 1.8s ease-out infinite', pointerEvents: 'none' }} />
              <span style={{ position: 'absolute', left: '50%', top: '50%', width: sz, height: sz, marginLeft: -sz / 2, marginTop: -sz / 2,
                             borderRadius: '50%', background: 'radial-gradient(circle, #ff6a5e, #f04438)', boxShadow: '0 0 10px 2px rgba(240,68,56,.6)',
                             animation: 'amDot 2s ease-in-out infinite', pointerEvents: 'none' }} />
            </div>
          </Tooltip>
        );
      })}

      {/* ── OVERLAY: título + estado en vivo (arriba, sobre el mapa) ─────── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '14px 16px', zIndex: 4,
                    background: 'linear-gradient(180deg, rgba(6,11,20,.82) 0%, rgba(6,11,20,0) 100%)', pointerEvents: 'none' }}>
        <Group gap={9} wrap="nowrap">
          <IconWorldBolt size={20} color="#ff6a5e" style={{ filter: 'drop-shadow(0 0 6px rgba(240,68,56,.6))' }} />
          <Text fw={700} c="#eaf1ff" style={{ textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{titulo}</Text>
          <Badge size="sm" variant="filled" color="red" ml="auto" style={{ pointerEvents: 'auto' }}
            leftSection={<span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'amLive 1.4s ease-in-out infinite' }} />}>
            {pts.length} orígenes
          </Badge>
        </Group>
      </div>

      {/* ── OVERLAY: KPIs en vertical (arriba-derecha, compactos) ─────────── */}
      <div style={{ position: 'absolute', top: 50, right: 12, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 5, width: 138 }}>
        {KPIS.map((it) => {
          const Ic = it.Icon;
          return (
            <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', borderRadius: 9,
              background: 'rgba(9,16,28,.62)', border: '1px solid rgba(255,255,255,.1)', backdropFilter: 'blur(3px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7,
                            background: `${it.color}22`, flex: '0 0 24px' }}>
                <Ic size={14} color={it.color} />
              </div>
              <div style={{ lineHeight: 1.1, minWidth: 0 }}>
                <Text fw={800} c="#eaf1ff" style={{ fontSize: 16 }}>{it.value}</Text>
                <Text c="#9fb2d4" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: .3, whiteSpace: 'nowrap' }}>{it.label}</Text>
              </div>
            </div>
          );
        })}
      </div>

      {/* Los puntos ya indican el país (con tooltip al hover); sin chips al pie. */}
      {pts.length === 0 && (
        <Group justify="center" style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
          <Text size="sm" c="#7f93b5">Sin ataques localizados todavía.</Text>
        </Group>
      )}
    </div>
  );
}
