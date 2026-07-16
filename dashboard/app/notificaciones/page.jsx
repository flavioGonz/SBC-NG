'use client';
/* ============================================================================
 *  Notificaciones por correo — qué eventos del borde avisan, a quién, y con qué
 *  plantilla. El SMTP se configura en Ajustes; acá se elige QUÉ se manda.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Stack, Card, Group, Text, Badge, ThemeIcon, Button, TextInput, Switch, Alert,
  Table, Divider, Loader, SegmentedControl, Box,
} from '@mantine/core';
import {
  IconBellRinging, IconMail, IconSend, IconEye, IconAlertTriangle, IconShieldX,
  IconServerBolt, IconPlugConnectedX, IconCircleCheck, IconCurrencyDollar, IconChartBar, IconInfoCircle,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

const ICON = {
  'security.attack': IconShieldX, 'security.ban': IconAlertTriangle,
  'service.down': IconServerBolt, 'service.up': IconCircleCheck,
  'trunk.down': IconPlugConnectedX, 'fraud.toll': IconCurrencyDollar, 'digest.daily': IconChartBar,
};
const COLOR = {
  'security.attack': 'red', 'security.ban': 'orange', 'service.down': 'red',
  'service.up': 'teal', 'trunk.down': 'orange', 'fraud.toll': 'grape', 'digest.daily': 'teal',
};

export default function Notificaciones() {
  const { data, recargar } = usePoll('/notif', 0);
  const [to, setTo] = useState('');
  const [ev, setEv] = useState([]);
  const [sucio, setSucio] = useState(false);
  const [sel, setSel] = useState('security.attack');
  const [html, setHtml] = useState('');

  useEffect(() => { if (data && !sucio) { setTo(data.alert_to || ''); setEv(data.eventos || []); } }, [data, sucio]);
  useEffect(() => {
    api('/notif/preview?evento=' + sel).then((r) => setHtml(r.html || '')).catch(() => setHtml(''));
  }, [sel]);

  if (!data) return <Group justify="center" p="xl"><Loader /></Group>;

  const toggle = (evento, v) => { setSucio(true); setEv((xs) => xs.map((x) => x.evento === evento ? { ...x, habilitado: v } : x)); };
  const guardar = () => toastPromise(
    api('/notif', { method: 'PUT', body: { alert_to: to, eventos: ev } }).then(() => { setSucio(false); recargar(); }),
    { loading: 'Guardando…', success: 'Notificaciones guardadas', error: (e) => e.message });
  const test = (evento) => toastPromise(
    api('/notif/test', { method: 'POST', body: { evento, to } }),
    { loading: 'Enviando ejemplo…', success: (r) => 'Enviado a ' + r.to, error: (e) => e.message });

  return (
    <Stack gap="lg">
      <PageHeader icon={<IconBellRinging size={24} />} color="grape" title="Notificaciones por correo"
        subtitle="Qué eventos del borde avisan por email, a quién, y con qué plantilla"
        right={<Button leftSection={<IconMail size={16} />} onClick={guardar} disabled={!sucio}>Guardar</Button>} />

      <Alert variant="light" color="blue" radius="md" icon={<IconInfoCircle size={18} />}>
        El servidor de correo (SMTP) se configura en <b>Ajustes · Email</b>. Acá elegís <b>qué</b> se manda y <b>a quién</b>.
      </Alert>

      <Card withBorder radius="lg" p="lg">
        <TextInput label="Destinatarios de las alertas" description="Uno o varios, separados por coma. Vacío = no se manda nada."
          placeholder="noc@empresa.com, guardia@empresa.com" leftSection={<IconMail size={15} />}
          value={to} onChange={(e) => { setSucio(true); setTo(e.currentTarget.value); }} />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
        {/* tipos de evento */}
        <Card withBorder radius="lg" p={0}>
          <Text fw={700} p="md" pb="xs">Tipos de aviso</Text>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Tbody>
              {ev.map((e) => {
                const Ic = ICON[e.evento] || IconInfoCircle;
                return (
                  <Table.Tr key={e.evento} style={{ cursor: 'pointer' }} onClick={() => setSel(e.evento)}>
                    <Table.Td w={40}><ThemeIcon size={30} radius="md" variant="light" color={COLOR[e.evento] || 'gray'}><Ic size={17} /></ThemeIcon></Table.Td>
                    <Table.Td>
                      <Text fw={600} size="sm">{e.label}</Text>
                      <Text size="10px" c="dimmed" lh={1.25}>{e.desc}</Text>
                    </Table.Td>
                    <Table.Td w={90} align="right">
                      <Button size="compact-xs" variant="subtle" leftSection={<IconSend size={12} />}
                        onClick={(x) => { x.stopPropagation(); test(e.evento); }}>probar</Button>
                    </Table.Td>
                    <Table.Td w={50} align="right">
                      <Switch checked={!!e.habilitado} onClick={(x) => x.stopPropagation()}
                        onChange={(x) => toggle(e.evento, x.currentTarget.checked)} />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Card>

        {/* preview del template */}
        <Card withBorder radius="lg" p="md">
          <Group justify="space-between" mb="sm">
            <Group gap={8}><IconEye size={18} /><Text fw={700} size="sm">Vista previa</Text></Group>
            <SegmentedControl size="xs" value={sel} onChange={setSel} data={ev.map((e) => ({ value: e.evento, label: e.label.split(' ')[0] }))} />
          </Group>
          <Box style={{ border: '1px solid light-dark(#e6eaf2,#33415577)', borderRadius: 12, overflow: 'hidden', background: '#f1f4f9' }}>
            <iframe title="preview" srcDoc={html} style={{ width: '100%', height: 520, border: 0 }} />
          </Box>
        </Card>
      </div>
    </Stack>
  );
}
