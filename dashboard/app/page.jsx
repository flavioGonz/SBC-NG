'use client';
/* ============================================================================
 *  Resumen — el tablero de operaciones del borde. Un vistazo y sabés todo:
 *  qué contenedor está arriba, cuánto CPU/RAM/disco come el equipo, cuántas
 *  llamadas cursan, quién está registrado, las últimas llamadas, el estado de
 *  cada troncal y de cada placa de red. Sin adornos: datos que sirven.
 * ==========================================================================*/
import { SimpleGrid, Card, Group, Text, Badge, Table, ThemeIcon, Skeleton, Stack, Tooltip, Alert, RingProgress, Progress, Box } from '@mantine/core';
import {
  IconLayoutDashboard, IconServer2, IconShieldCheck, IconWaveSine, IconPlugConnected,
  IconAlertTriangle, IconCircleCheck, IconCpu, IconDatabase, IconDeviceDesktop,
  IconArrowsExchange, IconPhoneCall, IconClockHour4, IconBox,
} from '@tabler/icons-react';
import PageHeader from './PageHeader';
import Rj45 from '../components/Rj45';
import { useMonitor, MonCell } from './Mon';
import { usePoll, fmtUptime, fmtBps, ipDe } from './api';

const gb = (b) => (b == null ? '—' : (b / 1e9).toFixed(1));
const mb = (b) => (b == null ? '—' : Math.round(b / 1e6));
const pct = (u, t) => (!t ? 0 : Math.min(100, Math.round((u / t) * 100)));
const colorPct = (p) => (p >= 90 ? 'red' : p >= 70 ? 'orange' : 'teal');

function Gauge({ label, icon, pctv, detalle }) {
  const color = colorPct(pctv);
  return (
    <Stack gap={4} align="center">
      <RingProgress size={104} thickness={9} roundCaps sections={[{ value: pctv, color }]}
        label={<Stack gap={0} align="center"><Text fw={800} fz={20} lh={1}>{pctv}%</Text><ThemeIcon size={20} variant="transparent" color={color}>{icon}</ThemeIcon></Stack>} />
      <Text size="xs" fw={700}>{label}</Text>
      <Text size="10px" c="dimmed">{detalle}</Text>
    </Stack>
  );
}

function Kpi({ icon, label, value, color, hint }) {
  return (
    <Card p="md" className="sbc-panel-accent" style={{ '--acc': `var(--mantine-color-${color}-5)` }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text size="11px" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '.05em' }}>{label}</Text>
          <Text fw={800} fz={30} lh={1.1} mt={4}>{value}</Text>
          {hint && <Text size="11px" c="dimmed" mt={2}>{hint}</Text>}
        </div>
        <ThemeIcon size={40} radius="md" variant="light" color={color}>{icon}</ThemeIcon>
      </Group>
    </Card>
  );
}

const nombreCorto = (n) => n.replace(/^sbcng-/, '').replace(/-1$/, '');

export default function Resumen() {
  const { data: sys } = usePoll('/system', 10000);
  const { data: st, cargando } = usePoll('/status', 8000);
  const { data: mt } = usePoll('/metrics', 8000);
  const { data: red } = usePoll('/network', 8000);
  const { data: media } = usePoll('/media/live', 8000);
  const { data: troncales } = usePoll('/trunks', 15000);
  const { data: regs } = usePoll('/registrations', 12000);
  const { data: cdr } = usePoll('/cdr?limit=6', 12000);
  const mon = useMonitor();

  const kam = (st && st.kamailio) || {};
  const ifaces = (red && red.interfaces) || [];
  const caidas = (red && red.resumen && red.resumen.caidas) || [];
  const conts = (sys && sys.contenedores) || [];
  const host = (sys && sys.host) || {};

  const sip = (mt && mt.sip) || {};
  const numMet = (k, alt = 0) => { const v = sip[k]; return v == null ? alt : (typeof v === 'string' ? parseInt(v, 10) || 0 : v); };
  const activas = numMet('dialog:active_dialogs', numMet('active_dialogs'));
  const bloqueos = (mt && mt.bloqueos) || 0;
  const transcodificando = (media && media.transcodificando) || 0;
  const registrados = (regs && (regs.vivos ?? regs.total)) || 0;
  const trs = troncales || [];
  const cdrs = Array.isArray(cdr) ? cdr : [];
  const registros = (regs && regs.registros) || [];

  const cpuP = host.cpus ? Math.min(100, Math.round((host.load / host.cpus) * 100)) : 0;
  const ramP = pct(host.mem_total - host.mem_free, host.mem_total);
  const diskP = pct(host.disk_used, host.disk_total);

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconLayoutDashboard size={24} />}
        title="Resumen"
        subtitle="Tablero de operaciones del borde"
        right={
          <Badge size="lg" variant="light" color={kam.ok ? 'teal' : 'red'}
                 leftSection={kam.ok ? <IconCircleCheck size={14} /> : <IconAlertTriangle size={14} />}>
            {kam.ok ? `Motor SIP · ${fmtUptime(kam.uptime && kam.uptime.uptime)}` : 'Motor SIP sin respuesta'}
          </Badge>
        }
      />

      {caidas.length > 0 && (
        <Alert color="red" variant="light" radius="lg" icon={<IconAlertTriangle size={18} />}>
          Interfaz sin enlace: <b>{caidas.join(', ')}</b>. Sin la pata no hay señalización ni audio.
        </Alert>
      )}

      {/* KPIs */}
      <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="md">
        <Kpi icon={<IconWaveSine size={20} />} label="Llamadas activas" value={activas} color="sbc" hint="diálogos SIP en curso" />
        <Kpi icon={<IconPlugConnected size={20} />} label="Registrados" value={registrados} color="cyan" hint="internos en el borde" />
        <Kpi icon={<IconArrowsExchange size={20} />} label="Transcodificando" value={transcodificando} color="grape" hint="sesiones rtpengine" />
        <Kpi icon={<IconShieldCheck size={20} />} label="IPs bloqueadas" value={bloqueos} color={bloqueos ? 'orange' : 'teal'} hint="escaneos frenados" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        {/* Recursos del appliance */}
        <Card p="lg">
          <Group justify="space-between" mb="md">
            <Group gap={9}><ThemeIcon size={30} radius="md" variant="light" color="sbc"><IconCpu size={17} /></ThemeIcon><Text fw={700}>Recursos</Text></Group>
            {host.uptime != null && <Badge size="sm" variant="light" color="gray" leftSection={<IconClockHour4 size={11} />}>{fmtUptime(host.uptime)}</Badge>}
          </Group>
          {!sys ? <Skeleton h={120} radius="md" /> : (
            <SimpleGrid cols={3} spacing="xs">
              <Gauge label="CPU" icon={<IconCpu size={13} />} pctv={cpuP} detalle={`carga ${host.load?.toFixed(1)} · ${host.cpus} vCPU`} />
              <Gauge label="RAM" icon={<IconDatabase size={13} />} pctv={ramP} detalle={`${gb(host.mem_total - host.mem_free)}/${gb(host.mem_total)} GB`} />
              <Gauge label="Disco" icon={<IconServer2 size={13} />} pctv={diskP} detalle={`${gb(host.disk_used)}/${gb(host.disk_total)} GB`} />
            </SimpleGrid>
          )}
        </Card>

        {/* Contenedores del stack (2 col de ancho) */}
        <Card p="lg" style={{ gridColumn: 'span 2' }}>
          <Group gap={9} mb="sm"><ThemeIcon size={30} radius="md" variant="light" color="grape"><IconBox size={17} /></ThemeIcon><Text fw={700}>Contenedores del stack</Text><Badge size="sm" variant="light" color="gray">{conts.length}</Badge></Group>
          {!sys ? <Skeleton h={120} radius="md" /> : (
            <Table verticalSpacing={6} fz="xs" highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>Servicio</Table.Th><Table.Th>Estado</Table.Th><Table.Th>CPU</Table.Th><Table.Th>Memoria</Table.Th><Table.Th>Uptime</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {conts.map((c) => {
                  const up = c.state === 'running';
                  return (
                    <Table.Tr key={c.name}>
                      <Table.Td><Group gap={7} wrap="nowrap"><IconBox size={13} style={{ opacity: .5 }} /><Text fw={650} ff="monospace">{nombreCorto(c.name)}</Text></Group></Table.Td>
                      <Table.Td><Badge size="xs" variant="dot" color={up ? 'teal' : 'red'}>{c.state}</Badge></Table.Td>
                      <Table.Td>{c.cpu != null ? <Group gap={6} wrap="nowrap" style={{ minWidth: 90 }}><Progress value={Math.min(100, c.cpu)} color={colorPct(c.cpu)} size="sm" w={54} radius="xl" /><Text fz="10px" c="dimmed">{c.cpu}%</Text></Group> : '—'}</Table.Td>
                      <Table.Td ff="monospace">{c.mem != null ? `${mb(c.mem)} MB` : '—'}</Table.Td>
                      <Table.Td c="dimmed">{(c.status || '').replace(/^Up\s*/, '') || '—'}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        {/* Interfaces */}
        <Card p="lg">
          <Group gap={9} mb="sm" justify="space-between">
            <Group gap={9}><ThemeIcon size={30} radius="md" variant="light" color="cyan"><IconPlugConnected size={17} /></ThemeIcon><Text fw={700}>Interfaces de red</Text></Group>
            <Badge variant="light" color="gray" size="sm">{ifaces.length}</Badge>
          </Group>
          {!red ? <Skeleton h={90} radius="md" /> : (
            <Group gap="lg" wrap="wrap">
              {ifaces.map((i) => {
                const dir = ipDe(i);
                return (
                  <Tooltip key={i.name} label={`${dir ? dir.ip : 'sin IP'} · ${fmtBps(i.rx_bps)} ↓ / ${fmtBps(i.tx_bps)} ↑`}>
                    <Stack gap={2} align="center" style={{ minWidth: 92 }}>
                      <Rj45 estado={i.estado} rx={i.rx_bps} tx={i.tx_bps} size={50} />
                      <Text size="xs" fw={700} ff="monospace">{i.name}</Text>
                      <Text size="10px" c="dimmed" ff="monospace">{dir ? dir.ip : '—'}</Text>
                    </Stack>
                  </Tooltip>
                );
              })}
            </Group>
          )}
        </Card>

        {/* Troncales */}
        <Card p="lg">
          <Group gap={9} mb="sm" justify="space-between">
            <Group gap={9}><ThemeIcon size={30} radius="md" variant="light" color="orange"><IconServer2 size={17} /></ThemeIcon><Text fw={700}>Troncales</Text></Group>
            <Badge variant="light" color="gray" size="sm">{trs.length}</Badge>
          </Group>
          {trs.length === 0 ? <Text size="sm" c="dimmed">Sin troncales cargadas.</Text> : (
            <Table verticalSpacing={7} fz="xs" highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>Operador</Table.Th><Table.Th>Transporte</Table.Th><Table.Th>Estado</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {trs.map((t) => (
                  <Table.Tr key={t.id}>
                    <Table.Td><Text fw={650}>{t.name}</Text><Text size="10px" c="dimmed" ff="monospace">{t.provider_host}</Text></Table.Td>
                    <Table.Td><Badge size="xs" variant="light" color="gray">{t.mode === 'webrtc-client' ? 'WSS' : (t.transport || 'udp').toUpperCase()}</Badge></Table.Td>
                    <Table.Td><MonCell e={mon['tr' + t.id]} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        {/* Internos registrados */}
        <Card p="lg">
          <Group gap={9} mb="sm" justify="space-between">
            <Group gap={9}><ThemeIcon size={30} radius="md" variant="light" color="teal"><IconDeviceDesktop size={17} /></ThemeIcon><Text fw={700}>Internos registrados</Text></Group>
            <Badge variant="light" color="teal" size="sm">{registrados}</Badge>
          </Group>
          {registros.length === 0 ? <Text size="sm" c="dimmed">Ningún interno registrado a través del borde ahora mismo.</Text> : (
            <Table verticalSpacing={6} fz="xs" highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>Interno</Table.Th><Table.Th>IP origen</Table.Th><Table.Th>Transporte</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {registros.slice(0, 7).map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td><Text fw={700} ff="monospace">{r.usuario || r.aor}</Text></Table.Td>
                    <Table.Td ff="monospace" c="dimmed">{r.ip_origen}:{r.puerto}</Table.Td>
                    <Table.Td><Badge size="xs" variant="light" color="gray">{(r.transporte || 'udp').toUpperCase()}</Badge></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>

        {/* Últimas llamadas */}
        <Card p="lg">
          <Group gap={9} mb="sm"><ThemeIcon size={30} radius="md" variant="light" color="sbc"><IconPhoneCall size={17} /></ThemeIcon><Text fw={700}>Últimas llamadas</Text></Group>
          {cdrs.length === 0 ? <Text size="sm" c="dimmed">Todavía no cursó ninguna llamada.</Text> : (
            <Table verticalSpacing={6} fz="xs" highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>De → A</Table.Th><Table.Th>Resultado</Table.Th><Table.Th>Dur.</Table.Th><Table.Th>Hora</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {cdrs.map((c, k) => {
                  const col = c.resultado === 'atendida' ? 'teal' : c.resultado === 'cancelada' ? 'gray' : 'orange';
                  return (
                    <Table.Tr key={c.callid || k}>
                      <Table.Td ff="monospace">{c.src} <span style={{ opacity: .4 }}>→</span> {c.dst}</Table.Td>
                      <Table.Td><Badge size="xs" variant="light" color={col}>{c.resultado}</Badge></Table.Td>
                      <Table.Td>{c.duracion ? `${c.duracion}s` : '—'}</Table.Td>
                      <Table.Td c="dimmed">{c.inicio ? new Date(c.inicio).toLocaleTimeString('es-UY', { hour12: false }) : '—'}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
