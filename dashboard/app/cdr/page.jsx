'use client';
/* ============================================================================
 *  CDR del borde — el registro de llamadas del SBC.
 *
 *  El SBC lleva su propio libro de llamadas, aparte del de la central: cada llamada
 *  que cruzó el borde, con origen, destino, cuándo, cuánto duró y cómo terminó. Sirve
 *  para facturar por el borde, para pelearse con un operador ("esta llamada la cursé
 *  yo, acá está") y para ver el tráfico real sin depender de la PBX.
 * ==========================================================================*/
import { useMemo, useState } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, ThemeIcon, TextInput, SegmentedControl,
  Skeleton, Code, Tooltip,
} from '@mantine/core';
import {
  IconReceipt, IconSearch, IconPhoneCall, IconPhoneOff, IconPhoneX, IconArrowRight,
  IconClock,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { usePoll } from '../api';

const RES = {
  atendida:    { c: 'teal', t: 'Atendida', icon: IconPhoneCall },
  'no contestó': { c: 'orange', t: 'No contestó', icon: IconPhoneOff },
  cancelada:   { c: 'gray', t: 'Cancelada', icon: IconPhoneX },
  'en curso':  { c: 'sbc', t: 'En curso', icon: IconClock },
};
const fmtDur = (s) => (!s ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
const fmtT = (t) => (t ? new Date(t).toLocaleString('es-UY') : '—');

export default function CDR() {
  const { data, cargando } = usePoll('/cdr?limit=300', 8000);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('all');

  const cdr = data || [];
  const filtrada = useMemo(() => {
    let arr = cdr;
    if (filtro === 'ok') arr = arr.filter((c) => c.resultado === 'atendida');
    else if (filtro === 'fail') arr = arr.filter((c) => c.resultado !== 'atendida' && c.resultado !== 'en curso');
    if (q.trim()) {
      const s = q.toLowerCase();
      arr = arr.filter((c) => `${c.src}${c.dst}${c.srcip}${c.callid}`.toLowerCase().includes(s));
    }
    return arr;
  }, [cdr, q, filtro]);

  const atendidas = cdr.filter((c) => c.resultado === 'atendida').length;
  const totalMin = Math.round(cdr.reduce((a, c) => a + (c.duracion || 0), 0) / 60);

  return (
    <Stack gap="lg">
      <PageHeader icon={<IconReceipt size={24} />} title="CDR del borde"
        subtitle="El registro de llamadas propio del SBC, independiente del de la central"
        right={
          <Group gap="sm">
            <Badge size="lg" variant="light" color="teal">{atendidas} atendidas</Badge>
            <Badge size="lg" variant="light" color="sbc">{totalMin} min</Badge>
          </Group>
        } />

      <Group justify="space-between" wrap="wrap" gap="xs">
        <SegmentedControl size="xs" value={filtro} onChange={setFiltro}
          data={[{ label: 'Todas', value: 'all' }, { label: 'Atendidas', value: 'ok' }, { label: 'No atendidas', value: 'fail' }]} />
        <TextInput size="xs" leftSection={<IconSearch size={14} />} placeholder="Buscar número o IP…"
                   value={q} onChange={(e) => setQ(e.currentTarget.value)} w={240} />
      </Group>

      <Card p={0} className="sbc-fade-in">
        {cargando ? <Skeleton h={200} radius="lg" /> : (
          <Table highlightOnHover verticalSpacing="sm" fz="sm" stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Cuándo</Table.Th><Table.Th>Origen</Table.Th><Table.Th w={30} />
                <Table.Th>Destino</Table.Th><Table.Th>Duración</Table.Th>
                <Table.Th>Resultado</Table.Th><Table.Th>Desde IP</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtrada.map((c) => {
                const r = RES[c.resultado] || RES['en curso']; const RIcon = r.icon;
                return (
                  <Table.Tr key={c.callid}>
                    <Table.Td fz="xs" c="dimmed">{fmtT(c.inicio)}</Table.Td>
                    <Table.Td ff="monospace" fw={650}>{c.src || '—'}</Table.Td>
                    <Table.Td><IconArrowRight size={13} style={{ opacity: .4 }} /></Table.Td>
                    <Table.Td ff="monospace" fw={650}>{c.dst || '—'}</Table.Td>
                    <Table.Td ff="monospace">{fmtDur(c.duracion)}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={r.c} leftSection={<RIcon size={11} />}>
                        {r.t}{c.codigo && c.resultado !== 'atendida' ? ` · ${c.codigo}` : ''}
                      </Badge>
                    </Table.Td>
                    <Table.Td ff="monospace" fz="xs" c="dimmed">{c.srcip || '—'}</Table.Td>
                  </Table.Tr>
                );
              })}
              {filtrada.length === 0 && (
                <Table.Tr><Table.Td colSpan={7}>
                  <Stack align="center" py="xl" gap={6}>
                    <ThemeIcon size={46} radius="xl" variant="light" color="gray"><IconReceipt size={24} /></ThemeIcon>
                    <Text fw={600}>Todavía no hay llamadas registradas</Text>
                    <Text size="sm" c="dimmed" ta="center" maw={460}>
                      El CDR se llena cuando cruzan llamadas por el borde. Cada INVITE atendido y cada corte quedan acá.
                    </Text>
                  </Stack>
                </Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
