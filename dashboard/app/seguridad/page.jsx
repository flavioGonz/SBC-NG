'use client';
/* ============================================================================
 *  Seguridad — la puerta.
 *
 *  Todo lo que golpea el 5060 desde internet pasa por acá: escaneos de sipvicious,
 *  intentos de registro a fuerza bruta, INVITEs a números caros. pike + htable(ipban)
 *  los frena en el borde; secfilter tira los User-Agent conocidos de los escáneres.
 *  Esta pantalla muestra a quién frenamos y permite soltarlo si fue un falso positivo.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, Button, Skeleton, ThemeIcon, TextInput,
  SimpleGrid, Tooltip, Code, Timeline, Tabs, NumberInput, Switch, Alert, TagsInput, Divider,
  Select, ActionIcon, SegmentedControl, Progress, RingProgress,
} from '@mantine/core';
import {
  IconShieldCheck, IconSearch, IconLockOpen, IconAlertTriangle, IconBan, IconActivity,
  IconAdjustments, IconDeviceFloppy, IconPlayerPlay, IconServerCog, IconRefresh, IconWorld,
  IconList, IconPlus, IconTrash, IconRobot, IconCheck, IconFlame,
  IconMapPin, IconLockOff, IconShieldX,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import LiveLog from '../LiveLog';
import Skel, { SkelFilas } from '../Skel';
import Slot from '../Slot';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

const SEV = { crit: 'red', warn: 'orange', info: 'sbc' };

/* ── Ajustes del borde: los umbrales con los que se defiende ──────────────── */
function Ajustes() {
  const { data, cargando, recargar } = usePoll('/security/settings', 0);
  const [s, setS] = useState(null);
  const [sucio, setSucio] = useState(false);
  useEffect(() => { if (data && !sucio) setS(data); }, [data, sucio]);
  // `s` se llena en el useEffect, o sea despues del render en que `cargando` se apaga.
  if (cargando || !s) return <SkelFilas filas={6} />;

  const set = (k, v) => { setSucio(true); setS((x) => ({ ...x, [k]: v })); };

  const guardar = () => toastPromise(
    api('/security/settings', { method: 'PUT', body: s }).then(() => { setSucio(false); recargar(); }),
    { loading: 'Guardando…', success: 'Guardado. Falta aplicar.', error: 'No se pudo guardar' });
  const aplicar = () => toastPromise(
    api('/security/apply', { method: 'POST' }).then(recargar),
    { loading: 'Recargando el borde…', success: 'Umbrales aplicados', error: (e) => e.message });

  return (
    <Card p="lg" className="sbc-tabin">
      <Group justify="space-between" mb="md">
        <div>
          <Text fw={700}>Defensa del borde</Text>
          <Text size="sm" c="dimmed">Qué tiene que hacer alguien para que lo bloqueemos, y por cuánto tiempo.</Text>
        </div>
        <Group gap="sm">
          <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} onClick={guardar} disabled={!sucio}>Guardar</Button>
          <Button color="orange" leftSection={<IconPlayerPlay size={16} />} onClick={aplicar}>Aplicar</Button>
        </Group>
      </Group>

      {/* Sólo los umbrales que el borde REALMENTE usa. Si un control no mueve nada
          abajo, no va en la pantalla: un panel con perillas que no hacen nada es peor
          que un panel sin esas perillas. (El bloqueo por país queda pendiente de
          integrar GeoIP; hasta entonces no se ofrece.) */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <NumberInput label="Pedidos permitidos" description="Cuántos mensajes SIP tolera una IP…" min={1}
                     value={s.pike_req} onChange={(v) => set('pike_req', v)} />
        <NumberInput label="…en esta ventana (s)" description="…antes de considerarlo una avalancha" min={1}
                     value={s.pike_seg} onChange={(v) => set('pike_seg', v)} />
        <NumberInput label="Duración del bloqueo (s)" description="Cuánto queda afuera. 3600 = una hora." min={60}
                     value={s.ban_seg} onChange={(v) => set('ban_seg', v)} />
      </SimpleGrid>

      <Divider my="md" />

      <Stack gap="sm">
        <Switch label="Filtrar escáneres conocidos (secfilter)" checked={!!s.secfilter}
                onChange={(e) => set('secfilter', e.currentTarget.checked)}
                description="Tira los mensajes de sipvicious, friendly-scanner y compañía por su User-Agent. Es gratis y saca el 90% del ruido de fondo de internet." />
        <Switch label="Exigir TLS" checked={!!s.solo_tls} onChange={(e) => set('solo_tls', e.currentTarget.checked)}
                description="Rechaza la señalización en claro que venga de afuera. Ojo: un teléfono viejo que no habla TLS deja de registrar." />
      </Stack>

      <Alert variant="light" color="orange" radius="md" mt="md" icon={<IconAlertTriangle size={16} />}>
        Aplicar reescribe la configuración del borde y reinicia Kamailio: las llamadas en curso se cortan.
        No es una operación de horario pico.
      </Alert>
    </Card>
  );
}

/* ── Motores: qué está corriendo y reinicio manual ───────────────────────── */
function Motores() {
  const { data, cargando, recargar } = usePoll('/engines', 10000);
  if (cargando) return <SkelFilas filas={6} />;
  if (data && !data.docker) {
    return (
      <Alert color="orange" variant="light" radius="lg" icon={<IconAlertTriangle size={18} />}>
        El control-plane no llega al socket de Docker, así que puede guardar configuración pero no reiniciar los motores
        para aplicarla. Revisá que el compose monte <Code>/var/run/docker.sock</Code>.
      </Alert>
    );
  }
  const reiniciar = (m) => toastPromise(
    api(`/engines/${m}/restart`, { method: 'POST' }).then(recargar),
    { loading: `Reiniciando ${m}…`, success: `${m} reiniciado`, error: (e) => e.message });

  return (
    <Card p={0} className="sbc-tabin">
      <Table highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr><Table.Th>Motor</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Desde</Table.Th><Table.Th>Reinicios</Table.Th><Table.Th /></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {((data && data.motores) || []).map((m) => (
            <Table.Tr key={m.motor}>
              <Table.Td>
                <Group gap={8}>
                  <ThemeIcon size={26} radius="md" variant="light" color={m.corriendo ? 'teal' : 'red'}><IconServerCog size={14} /></ThemeIcon>
                  <Text fw={650}>{m.motor}</Text>
                </Group>
              </Table.Td>
              <Table.Td><Badge variant="light" color={m.corriendo ? 'teal' : 'red'}>{m.corriendo ? 'corriendo' : 'detenido'}</Badge></Table.Td>
              <Table.Td fz="xs" c="dimmed">{m.desde ? new Date(m.desde).toLocaleString('es-UY') : '—'}</Table.Td>
              <Table.Td>{m.reinicios ?? 0}</Table.Td>
              <Table.Td>
                <Tooltip label="Reiniciar: corta las llamadas en curso">
                  <Button size="compact-sm" variant="light" color="orange" leftSection={<IconRefresh size={14} />}
                          onClick={() => reiniciar(m.motor)}>Reiniciar</Button>
                </Tooltip>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

/* ── Listas: al que se delata solo ────────────────────────────────────────────
 *
 *  El ipban del pike frena al que INSISTE (muchos intentos en pocos segundos). Esto
 *  frena al que se DELATA en el primer paquete: el que viene con User-Agent
 *  "sipvicious", el que llega de una IP que ya conocemos, el que marca a un destino
 *  que no queremos. Es mas barato que el ipban —se descarta antes de procesar nada— y
 *  no necesita que el atacante haga ruido.
 *
 *  La lista BLANCA gana siempre: es la valvula de escape para cuando un cliente real
 *  quedo del lado equivocado de una regla.
 * ==========================================================================*/
const TIPOS = [
  { value: '0', label: 'User-Agent', ayuda: 'El teléfono dice qué es. Los escáneres no se molestan en mentir: "sipvicious", "friendly-scanner".' },
  { value: '3', label: 'Dirección IP', ayuda: 'Bloquea todo lo que venga de esa IP, sin importar qué mande.' },
  { value: '2', label: 'Dominio', ayuda: 'El dominio del From o del R-URI.' },
  { value: '4', label: 'Usuario', ayuda: 'El usuario marcado o el que llama. Sirve para tapar destinos caros.' },
  { value: '1', label: 'País', ayuda: 'Código de país (requiere geoip cargado en el motor).' },
];
const nombreTipo = (t) => (TIPOS.find((x) => x.value === String(t)) || {}).label || String(t);

function Listas() {
  const { data, cargando, recargar } = usePoll('/security/filters', 0);
  const [tipo, setTipo] = useState('0');
  const [lista, setLista] = useState('negra');
  const [dato, setDato] = useState('');

  if (cargando) return <SkelFilas filas={6} />;
  const filas = data || [];
  const negras = filas.filter((f) => !f.action);
  const blancas = filas.filter((f) => f.action);

  const agregar = () => {
    if (!dato.trim()) { toast('Falta el dato a filtrar', 'warn'); return; }
    return toastPromise(
      api('/security/filters', { method: 'POST', body: { type: +tipo, action: lista === 'blanca' ? 1 : 0, data: dato.trim() } })
        .then(() => { setDato(''); recargar(); }),
      { loading: 'Agregando…', success: 'Agregado y aplicado en el motor', error: (e) => e.message });
  };

  const borrar = (id) => toastPromise(
    api(`/security/filters/${id}`, { method: 'DELETE' }).then(recargar),
    { loading: 'Sacando…', success: 'Sacado y aplicado en el motor', error: (e) => e.message });

  const tabla = (fs, vacio) => (
    <Table highlightOnHover verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr><Table.Th w={130}>Tipo</Table.Th><Table.Th>Valor</Table.Th><Table.Th w={50} /></Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {fs.map((f) => (
          <Table.Tr key={f.id}>
            <Table.Td><Badge size="sm" variant="light" color="gray">{nombreTipo(f.type)}</Badge></Table.Td>
            <Table.Td><Code fz="11px">{f.data}</Code></Table.Td>
            <Table.Td>
              <ActionIcon variant="subtle" color="red" onClick={() => borrar(f.id)}><IconTrash size={15} /></ActionIcon>
            </Table.Td>
          </Table.Tr>
        ))}
        {fs.length === 0 && (
          <Table.Tr><Table.Td colSpan={3}><Text size="sm" c="dimmed" ta="center" py="md">{vacio}</Text></Table.Td></Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );

  return (
    <Stack gap="lg">
      <Alert variant="light" color="sbc" radius="lg" icon={<IconRobot size={18} />}>
        Esto se aplica <b>en el primer paquete</b>, antes de procesar nada: es la defensa más barata que tiene el
        borde. La <b>lista blanca gana siempre</b> — es la válvula de escape para cuando un cliente real queda del
        lado equivocado de una regla. Los cambios entran solos: no hay que aplicar nada.
      </Alert>

      <Card p="lg" className="sbc-fade-in">
        <Group gap={9} mb="md">
          <ThemeIcon size={30} radius="md" variant="light" color="red"><IconPlus size={17} /></ThemeIcon>
          <Text fw={700}>Agregar a una lista</Text>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="md" style={{ alignItems: 'end' }}>
          <Select label="Qué mirar" description="Por dónde se lo reconoce" data={TIPOS} value={tipo}
                  onChange={(v) => setTipo(v || '0')} />
          <TextInput label="Valor" description="Exacto, sin comodines" placeholder="sipvicious"
                     value={dato} onChange={(e) => setDato(e.currentTarget.value)} />
          <div>
            <Text size="sm" fw={500} mb={2}>Lista</Text>
            <Text size="xs" c="dimmed" mb={6}>Negra bloquea; blanca deja pasar</Text>
            <SegmentedControl fullWidth value={lista} onChange={setLista}
              data={[{ label: 'Negra', value: 'negra' }, { label: 'Blanca', value: 'blanca' }]} />
          </div>
          <Button leftSection={<IconPlus size={16} />} onClick={agregar}>Agregar</Button>
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="sm">
          {(TIPOS.find((t) => t.value === tipo) || {}).ayuda}
        </Text>
      </Card>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Card p={0} className="sbc-fade-in">
          <Group p="lg" pb="xs" gap={9}>
            <ThemeIcon size={28} radius="md" variant="light" color="red"><IconBan size={15} /></ThemeIcon>
            <Text fw={700}>Lista negra</Text>
            <Badge size="sm" variant="light" color="red">{negras.length}</Badge>
          </Group>
          {tabla(negras, 'La lista negra está vacía: hoy no se descarta a nadie por delatarse.')}
        </Card>

        <Card p={0} className="sbc-fade-in">
          <Group p="lg" pb="xs" gap={9}>
            <ThemeIcon size={28} radius="md" variant="light" color="teal"><IconCheck size={15} /></ThemeIcon>
            <Text fw={700}>Lista blanca</Text>
            <Badge size="sm" variant="light" color="teal">{blancas.length}</Badge>
          </Group>
          {tabla(blancas, 'Nadie tiene pase libre. Está bien: la lista blanca es la excepción, no la norma.')}
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

/* ── SOC — el centro de operaciones de seguridad del borde ─────────────────── */
const sevColor = (sv) => ({ crit: 'red', warn: 'orange', info: 'sbc' }[sv] || 'gray');
const ccFlag = (cc) => (cc && cc.length === 2) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';

function KpiSoc({ label, value, sufijo, color, icon }) {
  return (
    <Card p="md" className="sbc-panel-accent sbc-fade-in" style={{ '--acc': `var(--mantine-color-${color}-5)` }}>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="10.5px" fw={700} tt="uppercase" c="dimmed">{label}</Text>
          <Group gap={4} align="baseline" mt={5}>
            <Text fw={800} fz={26} lh={1}><Slot value={value} /></Text>
            {sufijo && <Text size="xs" c="dimmed" fw={600}>{sufijo}</Text>}
          </Group>
        </div>
        <ThemeIcon size={38} radius="md" variant="light" color={color}>{icon}</ThemeIcon>
      </Group>
    </Card>
  );
}

function SOC() {
  const { data, cargando, recargar } = usePoll('/soc', 8000);
  const [q, setQ] = useState('');
  if (cargando || !data) return <SkelFilas filas={8} />;

  const k = data.kpis || {};
  const bloqueos = (data.bloqueos || []).filter((b) =>
    !q || `${b.ip} ${b.country || ''} ${b.isp || ''}`.toLowerCase().includes(q.toLowerCase()));
  const maxPais = Math.max(1, ...(data.top_paises || []).map((p) => p.n));

  const desbloquear = (ip) => toastPromise(
    api('/security/unblock', { method: 'POST', body: { ip } }).then(recargar),
    { loading: `Soltando ${ip}…`, success: `${ip} desbloqueada`, error: 'No se pudo desbloquear' });

  const evLabel = (kind) => ({ bloqueo: 'Bloqueo', ataque: 'Ataque', mitigacion: 'Mitigación', motor: 'Motor', red: 'Red' }[kind] || kind);

  return (
    <Stack gap="lg">
      {/* KPIs */}
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="md">
        <KpiSoc label="IPs bloqueadas" value={k.bloqueados || 0} color="red" icon={<IconBan size={19} />} />
        <KpiSoc label="Últimas 24 h" value={k.ultimas_24h || 0} color="orange" icon={<IconFlame size={19} />} />
        <KpiSoc label="Países origen" value={k.paises || 0} color="grape" icon={<IconWorld size={19} />} />
        <KpiSoc label="Mitigaciones" value={k.mitigaciones || 0} color="teal" icon={<IconShieldCheck size={19} />} />
        <KpiSoc label="Permanentes" value={k.permanentes || 0} color="gray" icon={<IconLockOff size={19} />} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        {/* Top países con banderas */}
        <Card p="lg" className="sbc-fade-in">
          <Group gap={9} mb="md">
            <ThemeIcon size={30} radius="md" variant="light" color="grape"><IconMapPin size={17} /></ThemeIcon>
            <Text fw={700}>De dónde vienen los ataques</Text>
          </Group>
          {(data.top_paises || []).length === 0
            ? <Text size="sm" c="dimmed" ta="center" py="md">Sin bloqueos todavía. Bien: nadie insistió lo suficiente.</Text>
            : (
              <Stack gap="sm">
                {(data.top_paises || []).map((p) => (
                  <div key={p.pais}>
                    <Group justify="space-between" mb={3}>
                      <Group gap={6}><Text size="lg" lh={1}>{p.flag || '🏳️'}</Text><Text size="sm" fw={600}>{p.pais}</Text></Group>
                      <Badge size="sm" variant="light" color="red">{p.n}</Badge>
                    </Group>
                    <Progress value={(p.n / maxPais) * 100} color="red" size="sm" radius="xl" />
                  </div>
                ))}
              </Stack>
            )}
        </Card>

        {/* Top atacantes */}
        <Card p="lg" className="sbc-fade-in">
          <Group gap={9} mb="md">
            <ThemeIcon size={30} radius="md" variant="light" color="red"><IconFlame size={17} /></ThemeIcon>
            <Text fw={700}>Los más insistentes</Text>
            <Text size="xs" c="dimmed">ordenados por golpes</Text>
          </Group>
          {(data.top_atacantes || []).length === 0
            ? <Text size="sm" c="dimmed" ta="center" py="md">Nadie golpeando ahora mismo.</Text>
            : (
              <Table verticalSpacing="xs" fz="sm">
                <Table.Tbody>
                  {(data.top_atacantes || []).map((b) => (
                    <Table.Tr key={b.ip}>
                      <Table.Td><Text span>{b.flag || '🏳️'}</Text></Table.Td>
                      <Table.Td ff="monospace" fw={650}>{b.ip}</Table.Td>
                      <Table.Td fz="xs" c="dimmed" truncate maw={140}>{b.isp || b.country || '—'}</Table.Td>
                      <Table.Td><Badge size="sm" variant="light" color="orange">{b.hits} golpe(s)</Badge></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
        </Card>
      </SimpleGrid>

      {/* Bloqueos activos */}
      <Card p={0} className="sbc-fade-in">
        <Group p="lg" pb="sm" justify="space-between">
          <Group gap={9}>
            <ThemeIcon size={30} radius="md" variant="light" color="red"><IconBan size={17} /></ThemeIcon>
            <Text fw={700}>Bloqueos activos</Text>
            <Badge size="sm" variant="light" color="gray">{bloqueos.length}</Badge>
          </Group>
          <TextInput size="xs" placeholder="Buscar IP, país o ISP…" leftSection={<IconSearch size={14} />}
                     value={q} onChange={(e) => setQ(e.currentTarget.value)} w={240} />
        </Group>
        <Table highlightOnHover verticalSpacing="sm" fz="sm" stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40} /><Table.Th>IP</Table.Th><Table.Th>País</Table.Th>
              <Table.Th>ISP</Table.Th><Table.Th>Motivo</Table.Th><Table.Th>Golpes</Table.Th>
              <Table.Th>Bloqueada</Table.Th><Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bloqueos.map((b) => (
              <Table.Tr key={b.ip}>
                <Table.Td><Text size="lg" lh={1}>{b.flag || '🏳️'}</Text></Table.Td>
                <Table.Td ff="monospace" fw={650}>{b.ip}</Table.Td>
                <Table.Td fz="xs">{b.country || '—'}</Table.Td>
                <Table.Td fz="xs" c="dimmed" truncate maw={180}>{b.isp || '—'}</Table.Td>
                <Table.Td fz="xs" c="dimmed">{b.reason || '—'}</Table.Td>
                <Table.Td><Badge size="sm" variant="light" color={b.hits > 3 ? 'red' : 'orange'}>{b.hits || 1}</Badge></Table.Td>
                <Table.Td fz="xs" c="dimmed">{b.blocked_at ? new Date(b.blocked_at).toLocaleString('es-UY') : '—'}</Table.Td>
                <Table.Td>
                  <Tooltip label="Desbloquear (soltar del ipban)">
                    <ActionIcon variant="subtle" color="teal" onClick={() => desbloquear(b.ip)}><IconLockOff size={16} /></ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
            {bloqueos.length === 0 && (
              <Table.Tr><Table.Td colSpan={8}>
                <Stack align="center" py="xl" gap={6}>
                  <ThemeIcon size={44} radius="xl" variant="light" color="teal"><IconShieldCheck size={22} /></ThemeIcon>
                  <Text fw={600}>Ninguna IP bloqueada</Text>
                  <Text size="sm" c="dimmed">El borde está tranquilo. Cuando alguien insista, va a aparecer acá con su bandera.</Text>
                </Stack>
              </Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Línea de tiempo de eventos */}
      <Card p="lg" className="sbc-fade-in">
        <Group gap={9} mb="md">
          <ThemeIcon size={30} radius="md" variant="light" color="sbc"><IconActivity size={17} /></ThemeIcon>
          <Text fw={700}>Línea de tiempo de seguridad</Text>
        </Group>
        {(data.eventos || []).length === 0
          ? <Text size="sm" c="dimmed" ta="center" py="md">Sin eventos de seguridad todavía.</Text>
          : (
            <Timeline active={-1} bulletSize={18} lineWidth={2}>
              {(data.eventos || []).slice(0, 40).map((e) => {
                const d = e.detail || {};
                return (
                  <Timeline.Item key={e.id}
                    bullet={<span style={{ width: 8, height: 8, borderRadius: 999, background: `var(--mantine-color-${sevColor(e.severity)}-6)`, display: 'block' }} />}
                    title={<Group gap={6}><Badge size="xs" variant="light" color={sevColor(e.severity)}>{evLabel(e.kind)}</Badge>
                            {d.cc && <Text span size="sm">{ccFlag(d.cc)}</Text>}
                            {d.ip && <Text span ff="monospace" size="xs">{d.ip}</Text>}
                            {d.pais && <Text span size="xs" c="dimmed">{d.pais}</Text>}</Group>}>
                    <Text size="xs" c="dimmed">
                      {d.motivo || d.msg || d.detail || (typeof e.detail === 'string' ? e.detail : '')}
                    </Text>
                    <Text size="10px" c="dimmed" mt={2}>{new Date(e.created_at).toLocaleString('es-UY')}</Text>
                  </Timeline.Item>
                );
              })}
            </Timeline>
          )}
      </Card>
    </Stack>
  );
}

export default function Seguridad() {
  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconShieldCheck size={24} />}
        title="Seguridad · SOC"
        subtitle="Quién intentó entrar, desde dónde, y qué lo frenó"
      />
      <LiveLog />
      <Tabs defaultValue="soc" variant="pills" radius="md" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="soc" leftSection={<IconShieldX size={15} />}>Centro de operaciones</Tabs.Tab>
          <Tabs.Tab value="ajustes" leftSection={<IconAdjustments size={15} />}>Ajustes del borde</Tabs.Tab>
          <Tabs.Tab value="listas" leftSection={<IconList size={15} />}>Listas negras/blancas</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="soc"><SOC /></Tabs.Panel>
        <Tabs.Panel value="ajustes"><Ajustes /></Tabs.Panel>
        <Tabs.Panel value="listas"><Listas /></Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
