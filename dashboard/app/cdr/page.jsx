'use client';
/* ============================================================================
 *  CDR del borde — el registro de llamadas del SBC.
 *
 *  El SBC lleva su propio libro de llamadas, aparte del de la central: cada llamada
 *  que cruzó el borde, con origen, destino, cuándo, cuánto duró y cómo terminó. Sirve
 *  para facturar por el borde, para pelearse con un operador ("esta llamada la cursé
 *  yo, acá está") y para ver el tráfico real sin depender de la PBX.
 *
 *  Cada fila dice además DE DÓNDE vino (bandera del país + ISP) y si esa IP está
 *  bloqueada ahora mismo en el borde, y explica el código SIP del resultado: un 488
 *  no es lo mismo que un 404, y el que mira el CDR no tiene por qué saberlo de memoria.
 * ==========================================================================*/
import { useMemo, useState } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, ThemeIcon, TextInput, SegmentedControl,
  Skeleton, Tooltip, ActionIcon, Button, SimpleGrid, Anchor,
} from '@mantine/core';
import {
  IconReceipt, IconSearch, IconPhoneCall, IconPhoneOff, IconPhoneX, IconArrowRight,
  IconClock, IconBan, IconWorld, IconCalendar, IconRefresh, IconServer2, IconShieldX,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import Slot from '../Slot';
import { usePoll } from '../api';

const RES = {
  atendida:      { c: 'teal',   t: 'Atendida',    icon: IconPhoneCall },
  'no contestó': { c: 'orange', t: 'No contestó', icon: IconPhoneOff },
  cancelada:     { c: 'gray',   t: 'Cancelada',   icon: IconPhoneX },
  'en curso':    { c: 'sbc',    t: 'En curso',    icon: IconClock },
};

/* Qué significa cada código SIP, en criollo. Es lo que se muestra al pasar el mouse
   por el resultado: el operador no tiene por qué saberse la RFC 3261 de memoria. */
const CODIGOS = {
  200: ['Atendida', 'La llamada se estableció normalmente.'],
  183: ['Progreso', 'El otro lado mandó audio antes de atender (tono, locución del operador).'],
  180: ['Timbrando', 'Llegó al destino y estaba sonando.'],
  400: ['Pedido mal formado', 'El INVITE tenía algo inválido. Suele ser un equipo mal configurado.'],
  401: ['No autorizado', 'Faltaron credenciales o estaban mal (el destino pidió autenticación).'],
  403: ['Prohibido', 'El destino rechazó la llamada por política: IP no permitida, país bloqueado o credenciales sin permiso.'],
  404: ['No encontrado', 'El número marcado no existe donde llegó la llamada (la central no tiene esa extensión o no hay ruta).'],
  407: ['Requiere proxy auth', 'El operador pide autenticación en el proxy.'],
  408: ['Sin respuesta', 'Nadie contestó la señalización a tiempo: el destino no responde (caído o inalcanzable).'],
  410: ['Ya no existe', 'El número existió pero fue dado de baja.'],
  480: ['No disponible', 'El destino existe pero está apagado, sin registrar o en No Molestar.'],
  484: ['Número incompleto', 'Faltan dígitos: casi siempre un plan de marcado mal armado.'],
  486: ['Ocupado', 'El destino estaba en otra llamada.'],
  487: ['Cancelada', 'Se cortó antes de que atendieran (colgaron o hubo failover).'],
  488: ['Medios incompatibles', 'No hubo códec o perfil de medios en común (típico: un lado ofrece audio cifrado SRTP y el otro sólo RTP plano).'],
  500: ['Error del servidor', 'La central o el operador falló procesando la llamada.'],
  502: ['Gateway mal', 'Un salto intermedio devolvió una respuesta inválida.'],
  503: ['Servicio no disponible', 'El destino está saturado o sin capacidad: troncal llena (CAC), operador caído.'],
  504: ['Timeout del gateway', 'Un salto intermedio no respondió a tiempo.'],
  603: ['Rechazada', 'El destino rechazó la llamada deliberadamente.'],
};
function explicar(cod) {
  if (!cod) return ['En curso', 'La llamada todavía no terminó o no quedó registrado el resultado final.'];
  if (CODIGOS[cod]) return CODIGOS[cod];
  if (cod >= 200 && cod < 300) return ['Atendida', 'Establecida correctamente.'];
  if (cod >= 300 && cod < 400) return ['Redirigida', 'El destino pidió que la llamada vaya a otro lado.'];
  if (cod >= 400 && cod < 500) return ['Rechazada por el destino', 'Error del lado del que llama o del destino.'];
  if (cod >= 500 && cod < 600) return ['Falla del servidor', 'Error de la central o del operador.'];
  return ['Rechazo global', 'La llamada fue rechazada para todos los destinos.'];
}

function Flag({ cc, size = 20 }) {
  const c = (cc || '').toLowerCase();
  const w = size, h = Math.round(size * 0.72);
  const box = { width: w, height: h, minWidth: w, flex: `0 0 ${w}px`, borderRadius: 3, display: 'inline-block', verticalAlign: 'middle' };
  if (!/^[a-z]{2}$/.test(c)) return <span style={{ ...box, background: 'var(--mantine-color-gray-2)' }} />;
  return <img src={`https://flagcdn.com/${c}.svg`} alt={cc} width={w} height={h}
    style={{ ...box, objectFit: 'cover', boxShadow: '0 0 0 1px rgba(0,0,0,.12)' }}
    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />;
}

const fmtDur = (s) => (!s ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
const fmtT = (t) => (t ? new Date(t).toLocaleString('es-UY') : '—');
const iso = (d) => d.toISOString().slice(0, 10);
const hoy = () => new Date();
const hace = (dias) => { const d = new Date(); d.setDate(d.getDate() - dias); return d; };

export default function CDR() {
  const [rango, setRango] = useState('7');       // '1' | '7' | '30' | 'todo' | 'custom'
  const [d1, setD1] = useState(iso(hace(7)));
  const [d2, setD2] = useState(iso(hoy()));
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('all');

  // Arma el querystring según el rango elegido (los presets no mandan fechas sueltas).
  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: '500' });
    if (rango === 'custom') { if (d1) p.set('desde', d1 + 'T00:00:00'); if (d2) p.set('hasta', d2 + 'T23:59:59'); }
    else if (rango !== 'todo') { p.set('desde', hace(parseInt(rango, 10)).toISOString()); }
    return p.toString();
  }, [rango, d1, d2]);

  const { data, cargando, recargar } = usePoll('/cdr?' + qs, 8000);
  const cdr = data || [];

  const filtrada = useMemo(() => {
    let arr = cdr;
    if (filtro === 'ok') arr = arr.filter((c) => c.resultado === 'atendida');
    else if (filtro === 'fail') arr = arr.filter((c) => c.resultado !== 'atendida' && c.resultado !== 'en curso');
    else if (filtro === 'bloq') arr = arr.filter((c) => c.bloqueada);
    if (q.trim()) {
      const s = q.toLowerCase();
      arr = arr.filter((c) => `${c.src} ${c.dst} ${c.srcip} ${c.country || ''} ${c.isp || ''} ${c.callid}`.toLowerCase().includes(s));
    }
    return arr;
  }, [cdr, q, filtro]);

  const atendidas = cdr.filter((c) => c.resultado === 'atendida').length;
  const fallidas = cdr.filter((c) => c.resultado !== 'atendida' && c.resultado !== 'en curso').length;
  const bloqueadas = cdr.filter((c) => c.bloqueada).length;
  const totalMin = Math.round(cdr.reduce((a, c) => a + (c.duracion || 0), 0) / 60);
  const asr = cdr.length ? Math.round((atendidas / cdr.length) * 100) : 0;

  const cnt = (f) => (f === 'all' ? cdr.length : f === 'ok' ? atendidas : f === 'fail' ? fallidas : bloqueadas);

  return (
    <Stack gap="lg">
      <PageHeader icon={<IconReceipt size={24} />} title="CDR del borde"
        subtitle="El registro de llamadas propio del SBC, independiente del de la central"
        right={
          <Group gap="sm">
            <Tooltip label="Answer Seizure Ratio: qué porcentaje de intentos terminó atendido">
              <Badge size="lg" variant="light" color={asr >= 50 ? 'teal' : asr >= 25 ? 'orange' : 'red'}>ASR {asr}%</Badge>
            </Tooltip>
            <Badge size="lg" variant="light" color="sbc"><Slot value={totalMin} /> min</Badge>
            <ActionIcon variant="light" onClick={recargar} title="Actualizar"><IconRefresh size={16} /></ActionIcon>
          </Group>
        } />

      {/* Resumen del período */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        {[
          ['Llamadas', cdr.length, 'sbc', IconReceipt],
          ['Atendidas', atendidas, 'teal', IconPhoneCall],
          ['No atendidas', fallidas, 'orange', IconPhoneOff],
          ['Desde IP bloqueada', bloqueadas, 'red', IconShieldX],
        ].map(([lbl, val, col, Ic]) => (
          <Card key={lbl} p="md" withBorder radius="md" className="sbc-fade-in">
            <Group gap={10} wrap="nowrap">
              <ThemeIcon size={38} radius="md" variant="light" color={col}><Ic size={20} /></ThemeIcon>
              <div><Text fw={800} fz={22} lh={1}><Slot value={val} /></Text><Text size="xs" c="dimmed">{lbl}</Text></div>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      {/* Filtros: período + estado + búsqueda */}
      <Card p="md" withBorder radius="md">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="xs" wrap="wrap">
            <ThemeIcon size={30} radius="md" variant="light" color="sbc"><IconCalendar size={16} /></ThemeIcon>
            <SegmentedControl size="xs" value={rango} onChange={setRango}
              data={[
                { label: 'Hoy', value: '1' },
                { label: '7 días', value: '7' },
                { label: '30 días', value: '30' },
                { label: 'Todo', value: 'todo' },
                { label: 'Personalizado', value: 'custom' },
              ]} />
            {rango === 'custom' && (
              <Group gap={6}>
                <input type="date" value={d1} onChange={(e) => setD1(e.target.value)}
                  style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid var(--mantine-color-default-border)', background: 'transparent', color: 'inherit', fontSize: 13 }} />
                <Text size="xs" c="dimmed">a</Text>
                <input type="date" value={d2} onChange={(e) => setD2(e.target.value)}
                  style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid var(--mantine-color-default-border)', background: 'transparent', color: 'inherit', fontSize: 13 }} />
              </Group>
            )}
          </Group>
          <TextInput size="xs" leftSection={<IconSearch size={14} />} placeholder="Buscar número, IP, país o ISP…"
            value={q} onChange={(e) => setQ(e.currentTarget.value)} w={260} />
        </Group>

        <Group gap={7} mt="sm" wrap="wrap">
          {[['all', 'Todas', 'gray'], ['ok', 'Atendidas', 'teal'], ['fail', 'No atendidas', 'orange'], ['bloq', 'Desde IP bloqueada', 'red']].map(([v, lbl, col]) => {
            const on = filtro === v;
            return (
              <Button key={v} size="compact-sm" radius="xl" variant={on ? 'filled' : 'light'} color={on ? col : 'gray'}
                onClick={() => setFiltro(v)}
                rightSection={<Badge size="xs" variant={on ? 'white' : 'light'} color={col}>{cnt(v)}</Badge>}>
                {lbl}
              </Button>
            );
          })}
        </Group>
      </Card>

      <Card p={0} className="sbc-fade-in">
        {cargando && !data ? <Skeleton h={200} radius="lg" /> : (
          <Table highlightOnHover verticalSpacing="sm" fz="sm" stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Cuándo</Table.Th><Table.Th>Origen</Table.Th><Table.Th w={30} />
                <Table.Th>Destino</Table.Th><Table.Th>Duración</Table.Th>
                <Table.Th>Resultado</Table.Th><Table.Th>Viene de</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtrada.map((c) => {
                const r = RES[c.resultado] || RES['en curso']; const RIcon = r.icon;
                const [titulo, detalle] = explicar(c.codigo);
                return (
                  <Table.Tr key={c.callid} style={c.bloqueada ? { background: 'light-dark(rgba(240,68,56,.05), rgba(240,68,56,.08))' } : undefined}>
                    <Table.Td fz="xs" c="dimmed">{fmtT(c.inicio)}</Table.Td>
                    <Table.Td ff="monospace" fw={650}>{c.src || '—'}</Table.Td>
                    <Table.Td><IconArrowRight size={13} style={{ opacity: .4 }} /></Table.Td>
                    <Table.Td ff="monospace" fw={650}>{c.dst || '—'}</Table.Td>
                    <Table.Td ff="monospace">{fmtDur(c.duracion)}</Table.Td>
                    <Table.Td>
                      <Tooltip multiline w={280} withArrow position="top" color="dark"
                        label={<div>
                          <Text fw={700} size="xs">{c.codigo ? `SIP ${c.codigo} · ${titulo}` : titulo}</Text>
                          <Text size="11px" mt={2} style={{ opacity: .85 }}>{detalle}</Text>
                          {c.razon && <Text size="10px" mt={4} style={{ opacity: .6 }}>Motivo del equipo: {c.razon}</Text>}
                        </div>}>
                        <Badge variant="light" color={r.c} leftSection={<RIcon size={11} />} style={{ cursor: 'help' }}>
                          {r.t}{c.codigo && c.resultado !== 'atendida' ? ` · ${c.codigo}` : ''}
                        </Badge>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={7} wrap="nowrap">
                        {c.interna
                          ? <Tooltip label="Red interna (tu central o LAN)"><ThemeIcon size={20} radius="sm" variant="light" color="gray"><IconServer2 size={12} /></ThemeIcon></Tooltip>
                          : <Tooltip label={c.country || 'País desconocido'}><span><Flag cc={c.cc} size={20} /></span></Tooltip>}
                        <div style={{ minWidth: 0 }}>
                          <Group gap={5} wrap="nowrap">
                            {c.srcip
                              ? <Anchor href={`https://ipinfo.io/${c.srcip}`} target="_blank" rel="noopener noreferrer" underline="hover" c="inherit" fz="xs" ff="monospace">{c.srcip}</Anchor>
                              : <Text fz="xs" c="dimmed">—</Text>}
                            {c.bloqueada && (
                              <Tooltip label="Esta IP está bloqueada ahora mismo en el borde">
                                <Badge size="xs" color="red" variant="filled" leftSection={<IconBan size={9} />}>bloqueada</Badge>
                              </Tooltip>
                            )}
                          </Group>
                          {c.isp && <Text size="10px" c="dimmed" truncate maw={170}>{c.isp}</Text>}
                        </div>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {filtrada.length === 0 && (
                <Table.Tr><Table.Td colSpan={7}>
                  <Stack align="center" py="xl" gap={6}>
                    <ThemeIcon size={46} radius="xl" variant="light" color="gray"><IconReceipt size={24} /></ThemeIcon>
                    <Text fw={600}>{cdr.length ? 'Nada coincide con el filtro' : 'Sin llamadas en este período'}</Text>
                    <Text size="sm" c="dimmed" ta="center" maw={460}>
                      {cdr.length
                        ? 'Probá con otro estado, otro término de búsqueda o ampliá el período.'
                        : 'El CDR se llena cuando cruzan llamadas por el borde. Ampliá el período o revisá que el módulo de contabilidad (acc) esté activo.'}
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
