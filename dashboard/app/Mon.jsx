'use client';
/* ============================================================================
 *  Monitoreo compartido de nodos (troncales y centrales).
 *
 *  Una sola fuente: /monitor (el barrido de OPTIONS del control-plane). Devuelve por
 *  nodo el estado, la latencia del OPTIONS, el MOS estimado y cuándo fue el último OK.
 *  Las tablas de Troncales y Centrales lo pintan igual, con el mismo criterio de color.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import { Group, Badge, Text, Tooltip } from '@mantine/core';
import { usePoll } from './api';

export function useMonitor() {
  const { data } = usePoll('/monitor', 8000);
  return (data && data.nodos) || {};
}

const mosColor = (m) => (m == null ? 'gray' : m >= 4.0 ? 'teal' : m >= 3.6 ? 'yellow' : 'red');

/* "hace X" en vivo desde el último OPTIONS OK. */
export function Desde({ ts, caido }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!ts) return <Text span size="xs" c="dimmed">nunca</Text>;
  const s = Math.max(0, Math.round((ahora - ts) / 1000));
  const txt = s < 60 ? `hace ${s}s` : `hace ${Math.floor(s / 60)}m ${s % 60}s`;
  return <Text span size="xs" c={caido ? 'red' : 'dimmed'} ff="monospace">{txt}</Text>;
}

/* Celda de monitoreo: estado + latencia + MOS + timer. */
export function MonCell({ e }) {
  if (!e) return <Text size="xs" c="dimmed">sin datos</Text>;
  return (
    <Group gap={6} wrap="nowrap">
      <Badge size="sm" variant="dot" color={e.ok ? 'teal' : 'red'}>
        {e.ok ? 'vivo' : 'caído'}
      </Badge>
      {e.latencia_ms != null && (
        <Tooltip label={`RTT del OPTIONS (${e.via})`}>
          <Badge size="sm" variant="light" color={e.ok ? 'sbc' : 'gray'}>
            {e.latencia_ms === 0 ? '<1 ms' : e.latencia_ms + ' ms'}
          </Badge>
        </Tooltip>
      )}
      {e.mos != null && (
        <Tooltip label="MOS estimado (calidad de voz): 4+ bueno · 3.6–4 regular · <3.6 pobre">
          <Badge size="sm" variant="light" color={mosColor(e.mos)}>MOS {e.mos.toFixed(2)}</Badge>
        </Tooltip>
      )}
      <Desde ts={e.ultimo_ok} caido={!e.ok} />
    </Group>
  );
}
