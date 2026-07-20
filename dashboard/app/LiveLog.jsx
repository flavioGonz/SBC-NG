'use client';
/* ============================================================================
 *  Registro de seguridad EN VIVO — el borde va cantando lo que rechaza:
 *  floods, escáneres, bans, 403. Llega por socket.io (long-polling sobre el
 *  proxy /backend) y entra con una animación sutil, como una consola viva.
 * ==========================================================================*/
import { useEffect, useRef, useState } from 'react';
import { Card, Group, Text, Badge, ActionIcon, Tooltip, ThemeIcon, Box, UnstyledButton } from '@mantine/core';
import { IconBroadcast, IconPlayerPause, IconPlayerPlay, IconTrash, IconRadar2, IconShieldBolt } from '@tabler/icons-react';
import { io } from 'socket.io-client';

const COLOR = { crit: '#f04438', warn: '#f79009', info: '#2e90fa' };
const TIPO = { ban: 'BAN', flood: 'FLOOD', secfilter: 'FILTRO', rechazo: 'RECHAZO', auth: 'AUTH', fraude: 'FRAUDE' };
const TIPOS = [['ban', 'Bans'], ['flood', 'Flood'], ['secfilter', 'Escáneres'], ['rechazo', 'Rechazos'], ['auth', 'Auth'], ['fraude', 'Fraude']];
const PILLCOLOR = { ban: 'red', flood: 'red', secfilter: 'orange', rechazo: 'blue', auth: 'orange', fraude: 'grape' };

function hora(t) {
  const d = new Date(t);
  return d.toLocaleTimeString('es-UY', { hour12: false });
}

function Pill({ active, onClick, label, n, color = 'gray' }) {
  return (
    <UnstyledButton onClick={onClick}
      style={{ borderRadius: 999, padding: '3px 11px', fontSize: 12, fontWeight: 600, lineHeight: 1.5,
        border: `1px solid ${active ? `var(--mantine-color-${color}-4)` : 'var(--mantine-color-default-border)'}`,
        background: active ? `var(--mantine-color-${color}-light)` : 'transparent',
        color: active ? `var(--mantine-color-${color}-7)` : 'var(--mantine-color-dimmed)', transition: 'all .15s' }}>
      {label} <span style={{ opacity: .55 }}>{n}</span>
    </UnstyledButton>
  );
}

export default function LiveLog() {
  const [lineas, setLineas] = useState([]);
  const [conectado, setConectado] = useState(false);
  const [pausa, setPausa] = useState(false);
  const [filtro, setFiltro] = useState(null);
  const pausaRef = useRef(false); pausaRef.current = pausa;
  const cont = useRef(null);
  const finRef = useRef(null);

  useEffect(() => {
    let token = '';
    try { token = localStorage.getItem('sbcng_jwt') || ''; } catch (_) {}
    const s = io({ path: '/backend/api/v1/rt', transports: ['polling'], auth: { token }, addTrailingSlash: false, reconnection: true, reconnectionDelay: 2000 });
    s.on('connect', () => setConectado(true));
    s.on('disconnect', () => setConectado(false));
    s.on('connect_error', () => setConectado(false));
    s.on('hist', (arr) => { if (Array.isArray(arr)) setLineas(arr.slice(-200)); });
    s.on('ev', (ev) => { if (!pausaRef.current) setLineas((L) => [...L, ev].slice(-300)); });
    return () => s.close();
  }, []);

  useEffect(() => {
    if (pausa || !finRef.current) return;
    finRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lineas, pausa]);

  const visibles = filtro ? lineas.filter((e) => e.tipo === filtro) : lineas;
  const cuenta = (tp) => lineas.reduce((a, e) => a + (e.tipo === tp ? 1 : 0), 0);

  return (
    <Card p={0} withBorder radius="md" className="sbc-fade-in" style={{ overflow: 'hidden' }}>
      <style jsx>{`
        @keyframes llin { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .ll-row { animation: llin .28s ease both; }
        @keyframes llpulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .ll-live { animation: llpulse 1.4s ease-in-out infinite; }
      `}</style>

      <Group justify="space-between" p="sm" px="md"
             style={{ borderBottom: '1px solid var(--mantine-color-default-border)',
                      background: 'light-dark(rgba(240,68,56,.04), rgba(240,68,56,.06))' }}>
        <Group gap={9}>
          <ThemeIcon size={30} radius="md" variant="light" color="red"><IconShieldBolt size={17} /></ThemeIcon>
          <div>
            <Group gap={7}>
              <Text fw={700} size="sm">Registro de seguridad en vivo</Text>
              <Badge size="xs" variant="dot" color={conectado ? 'teal' : 'gray'} className={conectado ? 'll-live' : ''}>
                {conectado ? 'en vivo' : 'conectando…'}
              </Badge>
            </Group>
            <Text size="10px" c="dimmed">lo que el borde rechaza, en tiempo real · {lineas.length} evento{lineas.length === 1 ? '' : 's'}</Text>
          </div>
        </Group>
        <Group gap={6}>
          <Tooltip label={pausa ? 'Reanudar' : 'Pausar'}>
            <ActionIcon variant="subtle" color="gray" onClick={() => setPausa((v) => !v)}>
              {pausa ? <IconPlayerPlay size={17} /> : <IconPlayerPause size={17} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Limpiar">
            <ActionIcon variant="subtle" color="gray" onClick={() => setLineas([])}><IconTrash size={16} /></ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Box ref={cont} style={{ height: 300, overflowY: 'auto', padding: '8px 0',
                               background: 'light-dark(#fbfcfe, #0b0f16)',
                               fontFamily: 'var(--mantine-font-family-monospace, monospace)' }}>
        {visibles.length === 0 && (
          <Group justify="center" h="100%" style={{ minHeight: 260 }}>
            <div style={{ textAlign: 'center' }}>
              <ThemeIcon size={54} radius="xl" variant="light" color="gray" className="ll-live"><IconRadar2 size={30} /></ThemeIcon>
              <Text size="sm" c="dimmed" mt="sm">{filtro ? 'Sin eventos de este tipo.' : 'Escuchando el borde…'}</Text>
              <Text size="11px" c="dimmed">{filtro ? 'Probá otro filtro.' : 'sin eventos de seguridad todavía — buena señal'}</Text>
            </div>
          </Group>
        )}
        {visibles.map((e, i) => (
          <div key={e.t + '-' + i} className="ll-row"
               style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '3px 14px',
                        fontSize: 12.5, lineHeight: 1.5, borderLeft: `3px solid ${COLOR[e.sev] || '#667085'}` }}>
            <span style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }}>{hora(e.t)}</span>
            <Badge size="xs" variant="light" radius="sm"
                   color={e.sev === 'crit' ? 'red' : e.sev === 'warn' ? 'orange' : 'blue'}
                   style={{ flexShrink: 0, width: 66, justifyContent: 'center' }}>
              {TIPO[e.tipo] || e.tipo}
            </Badge>
            {e.ip && <span style={{ color: COLOR[e.sev] || '#98a2b3', fontWeight: 700, flexShrink: 0 }}>{e.ip}</span>}
            <span style={{ color: 'var(--mantine-color-text)', wordBreak: 'break-word', opacity: .92 }}>{e.texto}</span>
          </div>
        ))}
        <div ref={finRef} />
      </Box>

      {/* filtros por tipo de ataque, en vivo */}
      <Group gap={7} p="xs" px="md" wrap="wrap"
             style={{ borderTop: '1px solid var(--mantine-color-default-border)',
                      background: 'light-dark(#fbfcfe, #0b0f16)' }}>
        <Pill active={!filtro} onClick={() => setFiltro(null)} label="Todos" n={lineas.length} color="gray" />
        {TIPOS.map(([tp, lbl]) => (
          <Pill key={tp} active={filtro === tp} onClick={() => setFiltro(filtro === tp ? null : tp)}
                label={lbl} n={cuenta(tp)} color={PILLCOLOR[tp]} />
        ))}
      </Group>
    </Card>
  );
}
